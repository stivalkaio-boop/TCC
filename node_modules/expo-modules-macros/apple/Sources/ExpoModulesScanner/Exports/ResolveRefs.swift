/// Fills in each `.ref`'s `refKind` once the whole scan is done.
///
/// A `TypeNode` is parsed from one `TypeSyntax` in isolation, so at parse time a name like `Status` is
/// just a name: the parser has no idea whether the scan will turn up an `@Record`, an `Enumerable`
/// enum, or nothing at all. Resolution is therefore a second pass over the collected surface, run once
/// every file has been walked.
///
/// A name is looked up the way Swift looks it up: from the type the use site is written in, outward to
/// file scope. In `Options`, `Encoding` names `Options.Encoding` when the scan declares one, else a
/// file-scope `Encoding`.
///
/// Three things change on a resolved ref:
/// - `name` becomes the declaration's qualified name, so a consumer can match it to the declaration
///   without repeating the scoped lookup.
/// - `refKind` names which kind declares it, so a consumer doesn't repeat this lookup.
/// - the `typeof` category is corrected for an enum, which crosses as its raw value rather than as an
///   object. That correction is the reason this can't be left to the consumer: the scanner is the only
///   side that knows the enum's `rawType`.
///
/// A name the scan never declared keeps its spelling, `refKind: nil`, and its `object` category. Not
/// an error: it is a platform convertible (`CGPoint`, `URL`) or a type from another module, and the
/// consumer's own catalog decides.

/// The declared names of a scanned surface, each mapped to how it should be reported at a use site.
/// Built once per scan and used for every ref lookup.
struct RefIndex {
  /// The declaration a ref resolves to.
  struct Entry: Equatable {
    /// The declaration's qualified name.
    let name: String
    let kind: RefKind
    /// The JS category a ref to the declaration crosses as.
    let jsType: JSType
    /// A `@SharedObject`'s JS name, `nil` for every other kind.
    var jsName: String? = nil
  }

  /// A declaration's qualified name -> its entry.
  private var entries: [String: Entry] = [:]

  init(surface: ExportedSurface) {
    for record in surface.records {
      entries[record.name] = Entry(name: record.name, kind: .record, jsType: .object)
    }
    for sharedObject in surface.sharedObjects {
      entries[sharedObject.name] = Entry(
        name: sharedObject.name,
        kind: .sharedObject,
        jsType: .object,
        jsName: sharedObject.jsName
      )
    }
    for union in surface.unions {
      // A union crosses as whichever alternative matched, so its category is only meaningful per
      // member. `object` is the honest coarse answer; the consumer reads `members` for the real shape.
      entries[union.name] = Entry(name: union.name, kind: .union, jsType: .object)
    }
    for enumeration in surface.enums {
      entries[enumeration.name] = Entry(
        name: enumeration.name,
        kind: .enum,
        jsType: jsType(ofRawType: enumeration.rawType)
      )
    }
  }

  /// The declaration a ref to `name` written inside the type `scope` resolves to, or `nil` when the
  /// scan declares no such type. `scope` is the qualified name of the type the use site is written
  /// in.
  ///
  /// The name is first looked up in `scope` and then in each enclosing scope out to file scope, so the
  /// innermost declaration wins, as in Swift. A leading `Self.` names `scope` itself, so it is dropped
  /// before the lookup. When that finds nothing, the leading components of a qualified spelling are
  /// dropped one at a time (`Media.Status` -> `Status`): a use site may qualify a name with a module
  /// the scan doesn't see, which is how the conformance and raw-type checks already match names.
  func lookup(_ name: String, in scope: String) -> Entry? {
    let name = name.hasPrefix("Self.") ? String(name.dropFirst("Self.".count)) : name
    var components = scope.split(separator: ".").map(String.init)
    while true {
      if let entry = entries[(components + [name]).joined(separator: ".")] {
        return entry
      }
      if components.isEmpty {
        break
      }
      components.removeLast()
    }
    var suffix = name.split(separator: ".").map(String.init).dropFirst()
    while !suffix.isEmpty {
      if let entry = entries[suffix.joined(separator: ".")] {
        return entry
      }
      suffix = suffix.dropFirst()
    }
    return nil
  }
}

/// The JS category a raw-value enum crosses as: its raw value's. A bare `Enumerable` conformance with
/// no raw type has nothing to go on, so it stays an object.
private func jsType(ofRawType rawType: TypeNode?) -> JSType {
  guard let rawType, let jsType = rawType.jsType else {
    return .object
  }
  return jsType
}

extension TypeNode {
  /// This node with every `.ref` in it resolved against `index` from the type `scope`, recursively.
  /// Returns an unchanged node when nothing in it resolves.
  func resolvingRefs(using index: RefIndex, in scope: String) -> TypeNode {
    switch self {
    case .primitive, .unknown:
      return self
    case .ref(let name, _, _):
      guard let entry = index.lookup(name, in: scope) else {
        return self
      }
      // Only an enum crosses as something other than an object, so only it carries an override.
      return .ref(
        name: entry.name,
        refKind: entry.kind,
        jsTypeOverride: entry.jsType == .object ? nil : entry.jsType
      )
    case .optional(let wrapped):
      return .optional(wrapped: wrapped.resolvingRefs(using: index, in: scope))
    case .array(let element):
      return .array(element: element.resolvingRefs(using: index, in: scope))
    case .dictionary(let key, let value):
      return .dictionary(
        key: key.resolvingRefs(using: index, in: scope),
        value: value.resolvingRefs(using: index, in: scope)
      )
    case .promise(let value):
      return .promise(value: value.resolvingRefs(using: index, in: scope))
    case .function(let parameters, let returns, let isAsync, let isThrowing):
      return .function(
        parameters: parameters.map { $0.resolvingRefs(using: index, in: scope) },
        returns: returns?.resolvingRefs(using: index, in: scope),
        isAsync: isAsync,
        isThrowing: isThrowing
      )
    }
  }
}

extension ExportedSurface {
  /// This surface with every `.ref` in every reported type resolved against its own declarations. The
  /// second pass `scanExports` runs once the walk is done.
  ///
  /// Each type's refs are looked up from that type, so a ref resolves to a type nested in it before
  /// one at file scope. Only the boundary types are rewritten; names, flags, and ordering are
  /// untouched. The declared types (a record's own name, a union's members) are not themselves refs,
  /// so they carry no `refKind`: it is the *use sites* that gain one.
  func resolvingRefs() -> ExportedSurface {
    let index = RefIndex(surface: self)
    return ExportedSurface(
      modules: modules.map { module in
        var resolved = module
        resolved.functions = module.functions.map { $0.resolvingRefs(using: index, in: module.name) }
        resolved.properties = module.properties.map { $0.resolvingRefs(using: index, in: module.name) }
        resolved.events = module.events.map { $0.resolvingRefs(using: index, in: module.name) }
        resolved.classes = module.classes.map { exportedClass in
          guard let entry = index.lookup(exportedClass.name, in: module.name),
            entry.kind == .sharedObject
          else {
            return exportedClass
          }
          return ExportedClass(name: entry.name, jsName: entry.jsName)
        }
        return resolved
      },
      sharedObjects: sharedObjects.map { sharedObject in
        var resolved = sharedObject
        if let initializer = sharedObject.initializer {
          resolved.initializer?.parameters = initializer.parameters.map {
            $0.resolvingRefs(using: index, in: sharedObject.name)
          }
        }
        resolved.functions = sharedObject.functions.map { $0.resolvingRefs(using: index, in: sharedObject.name) }
        resolved.properties = sharedObject.properties.map { $0.resolvingRefs(using: index, in: sharedObject.name) }
        resolved.events = sharedObject.events.map { $0.resolvingRefs(using: index, in: sharedObject.name) }
        return resolved
      },
      records: records.map { record in
        var resolved = record
        resolved.properties = record.properties.map { property in
          var resolvedProperty = property
          resolvedProperty.type = property.type.resolvingRefs(using: index, in: record.name)
          return resolvedProperty
        }
        return resolved
      },
      // An enum's raw type is a primitive or an unscanned spelling, never a ref to another scanned
      // type, so there is nothing in one to resolve.
      enums: enums,
      unions: unions.map { union in
        var resolved = union
        resolved.members = union.members.map { member in
          var resolvedMember = member
          resolvedMember.type = member.type.resolvingRefs(using: index, in: union.name)
          return resolvedMember
        }
        return resolved
      }
    )
  }
}

extension ExportedParameter {
  fileprivate func resolvingRefs(using index: RefIndex, in scope: String) -> ExportedParameter {
    var resolved = self
    resolved.type = type.resolvingRefs(using: index, in: scope)
    return resolved
  }
}

extension ExportedFunction {
  fileprivate func resolvingRefs(using index: RefIndex, in scope: String) -> ExportedFunction {
    var resolved = self
    resolved.parameters = parameters.map { $0.resolvingRefs(using: index, in: scope) }
    resolved.returns = returns?.resolvingRefs(using: index, in: scope)
    return resolved
  }
}

extension ExportedProperty {
  fileprivate func resolvingRefs(using index: RefIndex, in scope: String) -> ExportedProperty {
    var resolved = self
    resolved.type = type?.resolvingRefs(using: index, in: scope)
    return resolved
  }
}

extension ExportedEvent {
  fileprivate func resolvingRefs(using index: RefIndex, in scope: String) -> ExportedEvent {
    var resolved = self
    resolved.payload = payload?.resolvingRefs(using: index, in: scope)
    return resolved
  }
}
