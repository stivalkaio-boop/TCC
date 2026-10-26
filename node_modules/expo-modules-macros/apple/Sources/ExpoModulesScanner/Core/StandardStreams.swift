#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#elseif os(Windows)
import CRT
#endif

// Output goes straight to the file descriptors rather than through Foundation's `FileHandle`, which
// `FoundationEssentials` doesn't have. Outside Apple platforms the scanner uses only
// `FoundationEssentials`, so the binary doesn't link full Foundation and its ICU data.

/// Writes `text` to stdout as is, without adding a newline.
func writeToStandardOutput(_ text: String) {
  writeAll(text, toFileDescriptor: 1)
}

/// Writes `text` to stderr as is, without adding a newline.
func writeToStandardError(_ text: String) {
  writeAll(text, toFileDescriptor: 2)
}

/// Writes the UTF-8 bytes of `text` to `descriptor`, repeating the write until every byte is out. Retries
/// a write that a signal interrupted, and stops early if one fails otherwise, since there is nowhere
/// left to report that.
private func writeAll(_ text: String, toFileDescriptor descriptor: Int32) {
  var text = text
  text.withUTF8 { bytes in
    var remaining = UnsafeRawBufferPointer(bytes)
    while !remaining.isEmpty {
      #if os(Windows)
      let written = Int(_write(descriptor, remaining.baseAddress, CUnsignedInt(remaining.count)))
      #else
      let written = write(descriptor, remaining.baseAddress, remaining.count)
      #endif
      if written < 0 && errno == EINTR {
        continue
      }
      guard written > 0 else {
        return
      }
      remaining = UnsafeRawBufferPointer(rebasing: remaining[written...])
    }
  }
}
