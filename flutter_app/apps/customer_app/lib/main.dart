import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/cairo_slot_time.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  ensureCairoTime();
  runApp(const ProviderScope(child: CustomerApp()));
}
