/// The deep-scan surface: the full JS-exported shape of every `@ExpoModule`, `@SharedObject`, and
/// `@Record` type, with the per-member detail a TypeScript type generator needs. Read syntactically
/// (like the macros): each boundary type becomes a structured `TypeNode` tree so the consumer walks a
/// tagged tree rather than re-parsing Swift type syntax.
///
/// Every declaration and member carries the `platforms` that build it, and the ones that can be
/// written with an access modifier carry the `accessLevel` they spell. A declaration no platform
/// builds is not reported.

/// One Apple OS that builds a declaration.
struct ExportedPlatform: Encodable, Equatable {
  /// The OS, spelled as `os(...)` spells it: `iOS`, `macOS`, `tvOS`, `watchOS`, or `visionOS`.
  let name: String

  /// The version spelled in `@available` (`17.0` in `@available(iOS 17.0, *)`), or `nil` when no
  /// attribute on the declaration or its enclosing types names one. The latest version wins when
  /// several do.
  let introduced: String?

  /// How the declaration's own `@available` attributes deprecate it on this OS, or `nil` when they
  /// don't. Enclosing types are not read: a member of a deprecated type is not itself reported as
  /// deprecated.
  var deprecated: ExportedDeprecation? = nil
}

/// A deprecation from `@available`: `@available(*, deprecated, ...)` on every OS, or
/// `@available(iOS, deprecated: 16, obsoleted: 18, ...)` on one. Each field is `nil` when not written.
struct ExportedDeprecation: Encodable, Equatable {
  /// The version from `deprecated: 16`; `nil` for a bare `deprecated`.
  var since: String? = nil

  /// The version from `obsoleted: 18`, from which the declaration is no longer available. A
  /// declaration that is only obsoleted is still reported as deprecated.
  var obsoleted: String? = nil

  /// The `message:` text.
  var message: String? = nil

  /// The `renamed:` text: the Swift name of the replacement, as written (`newName`,
  /// `other(value:)`). It is not resolved to a JS name.
  var renamed: String? = nil
}

/// One parameter of a `@JS` function or `@JS init`.
struct ExportedParameter: Encodable, Equatable {
  /// The argument label (the `first` name): `to` in `func move(to point: Point)`, or `_` if unlabeled.
  let label: String

  /// The internal parameter name (the `second` name, else the same as `label`): `point` above.
  let name: String

  var type: TypeNode

  /// True when the caller may omit it: a default value or an optional type. Distinct from the type
  /// being `.optional` (a defaulted non-optional is also omittable). Encoded as `optional`.
  let isOptional: Bool

  /// The default value expression as source text (`1`, `"x"`, `.fast`), or `nil` when none is
  /// written. Not evaluated: it may be any expression.
  let defaultValue: String?

  private enum CodingKeys: String, CodingKey {
    case label, name, type, defaultValue
    case isOptional = "optional"
  }
}

/// One `@JS func` on a module or shared object.
struct ExportedFunction: Encodable, Equatable {
  /// The Swift declaration name. A function with `.withAsync("x")` has two entries with this name.
  let name: String

  /// The JS name it binds under: the `@JS("x")` override, else `name`. The second entry of a function
  /// with `.withAsync("x")` binds under `x`.
  let jsName: String

  var parameters: [ExportedParameter]

  /// The return type, or `nil` for `Void`. Named `returns` to pair with `parameters`.
  var returns: TypeNode?

  /// `async` (an async function is promise-returning in JS).
  let isAsync: Bool

  /// `throws`.
  let isThrowing: Bool

  /// `static`/`class` member.
  let isStatic: Bool

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  /// The flags are encoded under their TS-keyword spellings.
  private enum CodingKeys: String, CodingKey {
    case name, jsName, parameters, returns, accessLevel, platforms
    case isAsync = "async"
    case isThrowing = "throws"
    case isStatic = "static"
  }
}

/// One `@JS var` on a module or shared object.
struct ExportedProperty: Encodable, Equatable {
  /// The Swift declaration name.
  let name: String

  /// The JS name it binds under: the `@JS("x")` override, else `name`.
  let jsName: String

  /// The value type, or `nil` when undeterminable syntactically (no annotation and no literal
  /// default), the case the macro binds getter-only.
  var type: TypeNode?

  /// True when JS can assign to it: a stored `var` or a computed `var` with a `set`. Encoded as its
  /// inverse, `readonly`.
  let isSettable: Bool

  /// `static`/`class` member. Encoded as `static`.
  let isStatic: Bool

  /// The initial value of a stored property as source text, or `nil` when none is written.
  let defaultValue: String?

  /// The spelled access modifier, or `nil` when none is written. A setter-only modifier like
  /// `private(set)` is not the property's access level.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  private enum CodingKeys: String, CodingKey {
    case name, jsName, type, defaultValue, accessLevel, platforms
    case isReadonly = "readonly"
    case isStatic = "static"
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(name, forKey: .name)
    try container.encode(jsName, forKey: .jsName)
    try container.encodeIfPresent(type, forKey: .type)
    try container.encode(!isSettable, forKey: .isReadonly)
    try container.encode(isStatic, forKey: .isStatic)
    try container.encodeIfPresent(defaultValue, forKey: .defaultValue)
    try container.encodeIfPresent(accessLevel, forKey: .accessLevel)
    try container.encode(platforms, forKey: .platforms)
  }
}

/// One `@Record` property: a plain data slot exposing `optional`/`required` (vs. `ExportedProperty`,
/// a JS accessor exposing `readonly`/`static`). A record crosses the boundary by value, so the whole
/// type is read-only in JS; that's a record-level fact and isn't stamped per property.
struct ExportedRecordProperty: Encodable, Equatable {
  let name: String

  /// `@Record` requires a determinable type on every property, so this is never `nil`.
  var type: TypeNode

  /// Optional-typed. Encoded as `optional`.
  let isOptional: Bool

  /// The default value as source text, or `nil` when none is written. A field JS leaves out takes it.
  let defaultValue: String?

  /// The spelled access modifier, or `nil` when none is written. Never `private` or `fileprivate`,
  /// since those exclude a property from the record.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  /// Whether JS must supply this property, matching the macro's `RecordProperty.isRequired`. Encoded
  /// as `required`.
  var isRequired: Bool {
    return defaultValue == nil && !isOptional
  }

  private enum CodingKeys: String, CodingKey {
    case name, type, defaultValue, accessLevel, platforms
    case isOptional = "optional"
    case isRequired = "required"
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(name, forKey: .name)
    try container.encode(type, forKey: .type)
    try container.encode(isOptional, forKey: .isOptional)
    try container.encode(isRequired, forKey: .isRequired)
    try container.encodeIfPresent(defaultValue, forKey: .defaultValue)
    try container.encodeIfPresent(accessLevel, forKey: .accessLevel)
    try container.encode(platforms, forKey: .platforms)
  }
}

/// One `@Event var` on a module or shared object: a typed event JS listens for with
/// `addListener(jsName, …)` rather than calls.
struct ExportedEvent: Encodable, Equatable {
  /// The Swift property name, e.g. `onStatusChange`.
  let name: String

  /// The name JS listens under: the `@Event("x")` override, else `name` with a conventional `on`
  /// prefix stripped and decapitalized (`onStatusChange` -> `statusChange`).
  let jsName: String

  /// The single payload parameter's type, or `nil` for a no-payload `() -> Void` event.
  var payload: TypeNode?

  /// `@Event(sync: true)`, dispatching inline on the JS thread instead of scheduling.
  let isSync: Bool

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  private enum CodingKeys: String, CodingKey {
    case name, jsName, payload, accessLevel, platforms
    case isSync = "sync"
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(name, forKey: .name)
    try container.encode(jsName, forKey: .jsName)
    try container.encodeIfPresent(payload, forKey: .payload)
    try container.encode(isSync, forKey: .isSync)
    try container.encodeIfPresent(accessLevel, forKey: .accessLevel)
    try container.encode(platforms, forKey: .platforms)
  }
}

/// A `@ExpoModule` type and its `@JS` surface.
struct ExportedModule: Encodable, Equatable {
  /// The Swift class name. A module is always declared at file scope, since autolinking registers no
  /// other.
  let name: String

  /// The JS module name: `@ExpoModule("Foo")` override, else the class name.
  let jsName: String

  var functions: [ExportedFunction]
  var properties: [ExportedProperty]
  var events: [ExportedEvent]

  /// The classes listed in `@ExpoModule(classes: [...])`, in source order. Each is reachable from JS
  /// as a member of the module.
  var classes: [ExportedClass]

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  /// Absolute source path, matching `scan-modules`.
  let file: String
}

/// One entry of `@ExpoModule(classes: [...])`.
struct ExportedClass: Encodable, Equatable {
  /// The `name` of the matching `@SharedObject`, which is qualified when the class is nested
  /// (`Outer.Statement`). The Swift name as spelled in the argument when the scan found no
  /// `@SharedObject` with this name.
  let name: String

  /// The name of the module member JS reads the class from: the matching `@SharedObject`'s `jsName`.
  /// `nil` when the scan found no `@SharedObject` with this name, for example a class defined
  /// outside the scanned paths.
  let jsName: String?
}

/// The `@JS init` of a shared object: the constructor JS calls with `new`.
struct ExportedInitializer: Encodable, Equatable {
  var parameters: [ExportedParameter]

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]
}

/// A `@SharedObject` type: a JS class with an optional `@JS init` constructor plus its `@JS` members.
struct ExportedSharedObject: Encodable, Equatable {
  /// The Swift class name, qualified with the types it is nested in (`Outer.Player`).
  let name: String

  /// The JS class name: `@SharedObject("Foo")` override, else the class name without the enclosing
  /// types.
  let jsName: String

  /// The `@JS init`, or `nil` when there's none. A shared object has at most one; the first is kept
  /// if a malformed source has more. Not named `constructor`, which every JS object inherits.
  var initializer: ExportedInitializer?

  var functions: [ExportedFunction]
  var properties: [ExportedProperty]
  var events: [ExportedEvent]

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  let file: String
}

/// A `@Record` type and its properties (data only: no functions, accessors, or constructor).
struct ExportedRecord: Encodable, Equatable {
  /// The Swift type name (struct or class), qualified with the types it is nested in
  /// (`Outer.Options`).
  let name: String

  var properties: [ExportedRecordProperty]

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  let file: String
}

/// One case of a reported enum.
///
/// What `rawValue` carries depends on the enum's raw type, and a consumer reads it that way:
/// - `String`: always present, and **decoded** (`case active = "act"` reports `act`, unquoted). A case
///   writing none takes its own name, so nothing is left to derive.
/// - an integer type: present only where written, as **source text** (`1`, `1 << 3`), since the value
///   may be an expression a syntactic scan can't evaluate. Swift also continues from the preceding
///   case's value (`case a = 1; case b` makes `b` 2), and that carry is the consumer's to apply.
/// - no raw type: always absent, since the enum has no raw values.
struct ExportedEnumCase: Encodable, Equatable {
  /// The case name as declared.
  let name: String

  /// The raw value, decoded for a string and verbatim source text otherwise, or `nil` per the rule
  /// above.
  let rawValue: String?

  let platforms: [ExportedPlatform]

  private enum CodingKeys: String, CodingKey {
    case name, rawValue, platforms
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(name, forKey: .name)
    try container.encodeIfPresent(rawValue, forKey: .rawValue)
    try container.encode(platforms, forKey: .platforms)
  }
}

/// An `Enumerable` enum: a type that crosses the boundary as its raw value rather than as an object.
/// Detected by conformance, not by a macro attribute, because core converts it through its
/// `RawRepresentable`/`Enumerable` conformance (`Coding/…+Enumerable`) with no macro involved.
struct ExportedEnum: Encodable, Equatable {
  /// The Swift enum name, qualified with the types it is nested in (`Options.Encoding`). No `jsName`:
  /// an enum carries no macro to spell an override on, and it reaches JS as its raw values, not under
  /// a bound name.
  let name: String

  /// The raw value type as written (`String`, `Int`, …), or `nil` for a bare `Enumerable` conformance
  /// with no raw type. A `nil` raw type is reported as-is rather than dropped: the enum is still
  /// declared convertible, and the consumer decides how to treat it.
  let rawType: TypeNode?

  let cases: [ExportedEnumCase]

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  let file: String

  private enum CodingKeys: String, CodingKey {
    case name, rawType, cases, accessLevel, platforms, file
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(name, forKey: .name)
    try container.encodeIfPresent(rawType, forKey: .rawType)
    try container.encode(cases, forKey: .cases)
    try container.encodeIfPresent(accessLevel, forKey: .accessLevel)
    try container.encode(platforms, forKey: .platforms)
    try container.encode(file, forKey: .file)
  }
}

/// One alternative a `@Union` may hold: the Swift case name plus its payload type. Not a member in the
/// sense a module or shared object has members (functions, properties, events).
struct ExportedUnionMember: Encodable, Equatable {
  /// The case name as declared. Swift-side only: discrimination is structural, so it never reaches JS,
  /// but it ties an alternative back to the declaration.
  let name: String

  /// The associated value's type: what this alternative decodes from. Named `type` like every other
  /// type-valued field here; `payload` already means an event's argument type on `ExportedEvent`.
  var type: TypeNode

  let platforms: [ExportedPlatform]

  private enum CodingKeys: String, CodingKey {
    case name, type, platforms
  }
}

/// A `@Union` enum: a typed union of its cases' payload types (`A | B | C` in TypeScript).
///
/// **`members` is ordered, and the order is part of the contract.** Decode tries each payload in
/// declaration order and takes the first that succeeds, so where two shapes overlap (`Int` and
/// `Double`, two compatible records) the earlier case wins. Reordering them describes a different
/// union than the one the module runs.
struct ExportedUnion: Encodable, Equatable {
  /// The Swift enum name, qualified with the types it is nested in (`Options.Value`). No `jsName`:
  /// `@Union` takes no arguments, and a union reaches JS as its payload types rather than under a bound
  /// name.
  let name: String

  var members: [ExportedUnionMember]

  /// The spelled access modifier, or `nil` when none is written.
  let accessLevel: String?

  let platforms: [ExportedPlatform]

  let file: String
}

/// The exported types grouped by kind, nested under `exports` in the result so the surface is one
/// self-contained object separate from `stats`.
struct ExportedSurface: Encodable, Equatable {
  let modules: [ExportedModule]
  let sharedObjects: [ExportedSharedObject]
  let records: [ExportedRecord]
  let enums: [ExportedEnum]
  let unions: [ExportedUnion]
}

/// Version of the `scan-exports` output shape. Bumped on any breaking change to the envelope or to
/// anything under `exports`, so a consumer can verify it understands the output before trusting it.
/// Versioned independently of `scanModulesSchemaVersion`: the two commands serve different consumers
/// and change for different reasons. Version 2 added `events` to modules and shared objects; version 3
/// added `enums`; version 4 added `unions`; version 5 resolves refs, adding `refKind` and correcting
/// an enum ref's `typeof`; version 6 added `classes` to modules; version 7 reports nested types under
/// qualified names and gives a resolved ref the name of its declaration; version 8 reports
/// declarations in `#if` blocks, adds `platforms` (with deprecations), `accessLevel`, and
/// `defaultValue`, and replaces `constructorParameters` with `initializer`.
let scanExportsSchemaVersion = 8

/// The `scan-exports` result: the surface plus the run's stats. A distinct envelope from
/// `ScanModulesResult` (different consumer: TS generation vs. autolinking).
struct ScanExportsResult: Encodable, Equatable {
  let schemaVersion: Int
  let exports: ExportedSurface
  let stats: ScanStats
}
