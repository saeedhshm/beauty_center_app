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
      builder: (context, state) => const ExpertFoundationPage(),
    ),
  ],
);

class ExpertApp extends ConsumerWidget {
  const ExpertApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(apiClientProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'لمسة خبيرة',
      locale: const Locale('ar'),
      supportedLocales: LamsaLocalizations.supportedLocales,
      localizationsDelegates: LamsaLocalizations.localizationsDelegates,
      theme: LamsaTheme.light(seed: LamsaColors.plumDark),
      routerConfig: _router,
    );
  }
}

class ExpertFoundationPage extends ConsumerWidget {
  const ExpertFoundationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final network = ref.watch(networkStateProvider);
    final config = ref.watch(appConfigProvider);
    return LamsaNetworkBanner(
      isOnline: network.value,
      child: LamsaFoundationScreen(
        audienceLabel: context.lamsa.expertApp,
        title: context.lamsa.expertFoundationTitle,
        message: context.lamsa.expertFoundationMessage,
        environmentLabel: config.label,
        accent: LamsaColors.plumDark,
        items: const [
          'واجهة عربية واتجاه RTL',
          'هوية منفصلة لتطبيق الخبيرة',
          'اتصال API بلا أسرار',
          'تنقل وإدارة حالة موحدان',
        ],
      ),
    );
  }
}
