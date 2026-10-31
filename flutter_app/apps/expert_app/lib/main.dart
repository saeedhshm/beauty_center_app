import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

import 'src/app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Background and terminated delivery run in their own isolate. The handler
  // only reads the payload: navigation and authorization happen in the app.
  registerPushBackgroundHandler();
  runApp(const ProviderScope(child: ExpertApp()));
}
