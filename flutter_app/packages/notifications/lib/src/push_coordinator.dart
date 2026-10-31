import 'dart:async';

import 'package:lamsa_authentication/lamsa_authentication.dart';

import 'push_provider.dart';
import 'push_routing.dart';

/// Routes received pushes to the right screen, without ever trusting them.
///
/// What it does, in order, for every message in all three delivery states
/// (foreground, opened from background, terminated):
///
/// 1. reduce the payload to a validated reference ([pushDestinationFromData]);
///    anything unknown or malformed is dropped silently;
/// 2. wait for session restore to finish while the phase is still `restoring`,
///    so a cold start never navigates before the app knows who is signed in;
/// 3. require an authenticated session whose role matches the app's expected
///    role — a wrong role navigates nowhere;
/// 4. hand the id to [onOpenBooking], which opens the booking through the
///    booking API. Ownership is therefore decided by the server: a booking that
///    is not the user's comes back as 404 and no data is shown.
///
/// The coordinator never changes business state, and never logs payloads.
class PushCoordinator {
  PushCoordinator({
    required PushProvider provider,
    required SessionManager session,
    required Future<void> Function(String bookingId) onOpenBooking,
  }) : _provider = provider,
       _session = session,
       _onOpenBooking = onOpenBooking;

  final PushProvider _provider;
  final SessionManager _session;
  final Future<void> Function(String bookingId) _onOpenBooking;

  StreamSubscription<PushEnvelope>? _foregroundSub;
  StreamSubscription<PushEnvelope>? _openedSub;
  bool _attached = false;

  /// Destination waiting for the session to be restored, if any. Kept so a
  /// cold start still opens the booking once the phase settles.
  BookingPushDestination? _deferred;

  /// Called when a message arrives while the app is visible. No navigation is
  /// implied: the in-app center refreshes from the API.
  void Function(PushEnvelope message)? onForeground;

  Future<void> attach() async {
    if (_attached) return;
    _attached = true;
    _foregroundSub = _provider.onForegroundMessage.listen((message) {
      onForeground?.call(message);
    });
    _openedSub = _provider.onOpenedMessage.listen(handle);
    _session.addListener(_onSessionChanged);
    final initial = await _provider.initialMessage();
    if (initial != null) await handle(initial);
  }

  Future<void> dispose() async {
    _attached = false;
    _session.removeListener(_onSessionChanged);
    await _foregroundSub?.cancel();
    await _openedSub?.cancel();
    _foregroundSub = null;
    _openedSub = null;
  }

  /// Handles one received message. Exposed so the delivery states can be
  /// driven directly in tests.
  Future<void> handle(PushEnvelope message) async {
    final destination = resolvePushDestination(
      type: message.type,
      data: message.data,
    );
    if (destination is! BookingPushDestination) return;
    _deferred = destination;
    await _flush();
  }

  void _onSessionChanged() {
    unawaited(_flush());
  }

  /// Opens the pending destination only when the session can decide: never
  /// while restoring, and never without the right role.
  Future<void> _flush() async {
    final destination = _deferred;
    if (destination == null) return;
    if (_session.phase == SessionPhase.restoring) return;
    if (!_session.isAuthenticated) {
      _deferred = null;
      return;
    }
    if (_session.user?.role != _session.expectedRole) {
      _deferred = null;
      return;
    }
    _deferred = null;
    await _onOpenBooking(destination.bookingId);
  }
}
