import 'dart:async';

/// Outcome of a system notification-permission request.
enum PushPermission { granted, denied }

/// Source of device push tokens. Implementations wrap the platform plugin so
/// orchestration stays unit-testable without Firebase configuration.
abstract interface class PushProvider {
  /// Ensures Firebase is initialized; false when configuration is missing.
  Future<bool> ensureInitialized();

  /// Requests system permission at a user-appropriate moment.
  Future<PushPermission> requestPermission();

  /// Current token, or null when unavailable or permission was denied.
  Future<String?> token();

  /// Emits rotated tokens while the app runs.
  Stream<String> get onTokenRefresh;

  /// Deletes the local token copy (logout).
  Future<void> deleteToken();
}
