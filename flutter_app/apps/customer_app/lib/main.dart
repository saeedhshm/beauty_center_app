import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';

import 'src/app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  ensureBookingTime();
  runApp(const ProviderScope(child: CustomerApp()));
}
