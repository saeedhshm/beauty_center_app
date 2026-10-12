import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromDartDefines(),
);
final networkMonitorProvider = Provider<NetworkMonitor>(
  (ref) => NetworkMonitor(),
);
final networkStateProvider = StreamProvider<bool>(
  (ref) => ref.watch(networkMonitorProvider).changes,
);
final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(config: ref.watch(appConfigProvider)),
);

final _router = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const CustomerFoundationPage(),
    ),
  ],
);

class CustomerApp extends ConsumerWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(apiClientProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'لمسة',
      locale: const Locale('ar'),
      supportedLocales: LamsaLocalizations.supportedLocales,
      localizationsDelegates: LamsaLocalizations.localizationsDelegates,
      theme: LamsaTheme.light(),
      routerConfig: _router,
    );
  }
}

class CustomerFoundationPage extends ConsumerWidget {
  const CustomerFoundationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final network = ref.watch(networkStateProvider);
    final config = ref.watch(appConfigProvider);
    return LamsaNetworkBanner(
      isOnline: network.value,
      child: LamsaFoundationScreen(
        audienceLabel: context.lamsa.customerApp,
        title: context.lamsa.customerFoundationTitle,
        message: context.lamsa.customerFoundationMessage,
        environmentLabel: config.label,
        items: const [
          'واجهة عربية واتجاه RTL',
          'نظام تصميم مشترك',
          'اتصال API مضبوط بمهل وإلغاء',
          'تنقل أساسي قابل للتوسع',
        ],
      ),
    );
  }
}
