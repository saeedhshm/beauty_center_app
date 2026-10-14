import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'push_provider.dart';

/// Firebase-backed token source. All Firebase calls degrade to
/// "unavailable" when native configuration files are missing, so the apps
/// keep working (without instant push) until configuration lands.
class FirebasePushProvider implements PushProvider {
  FirebasePushProvider([FirebaseMessaging? messaging])
    : _messaging = messaging;

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
  Future<void> deleteToken() async {
    try {
      await _instance?.deleteToken();
    } on Object {
      // Best effort; server-side removal is handled by the registrar.
    }
  }
}
