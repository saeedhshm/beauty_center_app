import 'dart:async';

/// Outcome of a system notification-permission request.
enum PushPermission { granted, denied }

/// A received push, reduced to its contract fields: the approved event type
/// and the data map. Delivery state is not part of the contract because the
/// payload never carries business state.
class PushEnvelope {
  const PushEnvelope({required this.type, required this.data});

  /// Empty when the message had no type, which the router treats as "unknown".
  final String type;
  final Map<String, Object?> data;
}

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

  /// Messages delivered while the app is in the foreground.
  Stream<PushEnvelope> get onForegroundMessage;

  /// Messages the user opened while the app was in the background.
  Stream<PushEnvelope> get onOpenedMessage;

  /// The message that started a terminated app, read once; null when the app
  /// was launched normally.
  Future<PushEnvelope?> initialMessage();

  /// Deletes the local token copy (logout).
  Future<void> deleteToken();
}
