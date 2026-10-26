import SwiftSyntax

/// Where a directly-bound closure gets the Swift value it calls into. This is one of the two
/// orthogonal axes of a binding; the other is the `Phase` (which JS object the member is installed
/// on). The two are independent: choosing the prototype phase does not by itself decide whether the
/// receiver is `self`, `_self`, or the metatype.
///
/// - A module is a singleton, so its bindings call `self` and ignore the JS `this`.
/// - A shared-object *instance* member has a distinct native instance per JS object, so it recovers
///   the typed receiver from `this`.
/// - A `static`/`class` member has no instance at all; it calls the Swift member on the metatype
///   (`Cache.open(…)`) and ignores `this` (which, on the static side, is the constructor).
internal enum Receiver {
  /// The module singleton; the closure captures `self` strong.
  case module
  /// A shared object of the given concrete type; the closure captures nothing and recovers the receiver
  /// from `this` per call.
  case sharedObject(typeName: String)
  /// A `static`/`class` member of the given concrete type; the closure captures nothing and calls the
  /// Swift member on the type itself, ignoring `this`.
  case staticMember(typeName: String)

  /// The expression the body calls members on: `self` for a module, `_self` (bound by `unwrapStatement`)
  /// for a shared-object instance, the type name for a static member. The leading underscore on `_self`
  /// avoids colliding with a user member like `var owner`.
  var callee: String {
    switch self {
    case .module:
      return "self"
    case .sharedObject:
      return "_self"
    case .staticMember(let typeName):
      return typeName
    }
  }

  /// The leading body line binding the receiver, or `nil` when nothing needs to be unwrapped (a module
  /// reads `self` directly; a static member calls the type directly). For a shared-object instance,
  /// `native(from:as:)` recovers the typed instance from `this`, throwing on a foreign object or a type
  /// mismatch.
  ///
  /// The `this` object always comes from the borrowed `JavaScriptUnownedValue` (`asObject(in:)`): an
  /// async binding unwraps in its synchronous decode phase, before the borrowed value's lifetime ends,
  /// and only the recovered native instance crosses into the async body.
  var unwrapStatement: String? {
    switch self {
    case .module, .staticMember:
      return nil
    case .sharedObject(let typeName):
      return "let _self = try SharedObject.native(from: this.asObject(in: runtime), as: \(typeName).self)"
    }
  }

  /// The capture-clause fragment (with a trailing space, or empty when nothing is captured). A module
  /// captures `self` strong; a shared-object instance and a static member capture nothing.
  var captureClause: String {
    switch self {
    case .module:
      return "[self] "
    case .sharedObject, .staticMember:
      return ""
    }
  }
}

/// Which JS object a set of bindings is installed on: the second orthogonal axis alongside `Receiver`.
/// It selects the decorator entry point's argument label and the local name the body binds members onto,
/// mirroring JS class semantics (a class has a constructor function whose `.prototype` carries instance
/// members).
/// The raw value is the argument label of the decorator entry point, which is also the local name the
/// body binds members onto.
internal enum Phase: String {
  /// A concrete JS object: a singleton's own object (the module). Instance method; receiver `self`.
  case object
  /// The class constructor's `prototype`, carrying per-instance members. Static; receiver `_self`.
  case prototype
  /// The class constructor function itself, carrying `static`/`class` members. Static; receiver the type.
  case constructor
}
