import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'push_provider.dart';
import 'push_routing.dart';

/// Registered by each app in `main()` before the first frame.
///
/// Background and terminated delivery run in their own isolate, so this
/// handler may only read the payload. It deliberately performs no navigation
/// and no business mutation: the app re-reads the booking through the API once
/// it is in the foreground, after the session is restored and the role is
/// checked.
/// Registers the background handler. Apps call this in `main()` so Firebase
/// stays an implementation detail of this package.
void registerPushBackgroundHandler() {
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  final data = <String, Object?>{};
  for (final entry in message.data.entries) {
    data[entry.key] = entry.value;
  }
  // Parsing here proves the payload is at least well formed; the destination is
  // recomputed in the app isolate, which owns session and navigation.
  pushDestinationFromData(data);
}

/// Firebase-backed token source. All Firebase calls degrade to
/// "unavailable" when native configuration files are missing, so the apps
/// keep working (without instant push) until configuration lands.
class FirebasePushProvider implements PushProvider {
  FirebasePushProvider([FirebaseMessaging? messaging]) : _messaging = messaging;

  final FirebaseMessaging? _messaging;
  bool _ready = false;

  @override
  Future<bool> ensureInitialized() async {
    if (_ready) return true;
    try {
      await Firebase.initializeApp();
      _ready = true;
      return true;
    } on Object {
      return false;
    }
  }

  FirebaseMessaging? get _instance {
    if (!_ready) return null;
    try {
      return _messaging ?? FirebaseMessaging.instance;
    } on Object {
      return null;
    }
  }

  @override
  Future<PushPermission> requestPermission() async {
    final messaging = _instance;
    if (messaging == null) return PushPermission.denied;
    try {
      final settings = await messaging.requestPermission();
      return settings.authorizationStatus == AuthorizationStatus.authorized ||
              settings.authorizationStatus == AuthorizationStatus.provisional
          ? PushPermission.granted
          : PushPermission.denied;
    } on Object {
      return PushPermission.denied;
    }
  }

  @override
  Future<String?> token() async {
    try {
      return await _instance?.getToken();
    } on Object {
      return null;
    }
  }

  @override
  Stream<String> get onTokenRefresh {
    final messaging = _instance;
    if (messaging == null) return const Stream.empty();
    return messaging.onTokenRefresh.handleError((Object _) {});
  }

  @override
  Stream<PushEnvelope> get onForegroundMessage {
    final messaging = _instance;
    if (messaging == null) return const Stream.empty();
    return FirebaseMessaging.onMessage
        .map(_envelope)
        .handleError((Object _) {});
  }

  @override
  Stream<PushEnvelope> get onOpenedMessage {
    final messaging = _instance;
    if (messaging == null) return const Stream.empty();
    return FirebaseMessaging.onMessageOpenedApp
        .map(_envelope)
        .handleError((Object _) {});
  }

  @override
  Future<PushEnvelope?> initialMessage() async {
    final messaging = _instance;
    if (messaging == null) return null;
    try {
      final message = await messaging.getInitialMessage();
      return message == null ? null : _envelope(message);
    } on Object {
      return null;
    }
  }

  PushEnvelope _envelope(RemoteMessage message) {
    final data = <String, Object?>{};
    for (final entry in message.data.entries) {
      data[entry.key] = entry.value;
    }
    final type = message.data['type'] ?? message.messageType;
    return PushEnvelope(type: type ?? '', data: data);
  }

  @override
  Future<void> deleteToken() async {
    try {
      await _instance?.deleteToken();
    } on Object {
      // Best effort; server-side removal is handled by the registrar.
    }
  }
}
