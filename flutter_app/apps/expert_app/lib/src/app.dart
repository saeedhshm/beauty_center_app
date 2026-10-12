import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'expert_profile_screen.dart';

final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromDartDefines(),
);
final networkMonitorProvider = Provider<NetworkMonitor>(
  (ref) => NetworkMonitor(),
);
final networkStateProvider = StreamProvider<bool>((ref) async* {
  final monitor = ref.watch(networkMonitorProvider);
  yield await monitor.isConnected;
  yield* monitor.changes;
});
final rawApiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(config: ref.watch(appConfigProvider)),
);
final authGatewayProvider = Provider<AuthGateway>(
  (ref) => AuthApi(ref.watch(rawApiClientProvider)),
);
final sessionStoreProvider = Provider<SessionStore>(
  (ref) => SecureSessionStore(namespace: 'lamsa_expert'),
);
final sessionManagerProvider = Provider<SessionManager>((ref) {
  final manager = SessionManager(
    expectedRole: AuthRole.expert,
    gateway: ref.watch(authGatewayProvider),
    store: ref.watch(sessionStoreProvider),
  );
  ref.onDispose(manager.dispose);
  unawaited(manager.bootstrap());
  return manager;
});
final authenticatedApiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    config: ref.watch(appConfigProvider),
    authenticator: ref.watch(sessionManagerProvider),
  ),
);
final expertApiProvider = Provider<ExpertGateway>(
  (ref) => ExpertApi(ref.watch(authenticatedApiClientProvider)),
);

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionManagerProvider);
  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) {
      final location = state.matchedLocation;
      return switch (session.phase) {
        SessionPhase.restoring => location == '/splash' ? null : '/splash',
        SessionPhase.offline => location == '/offline' ? null : '/offline',
        SessionPhase.anonymous ||
        SessionPhase.expired ||
        SessionPhase.wrongRole => location == '/auth' ? null : '/auth',
        SessionPhase.authenticated =>
          location == '/profile' ? null : '/profile',
      };
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SessionBootstrapScreen(),
      ),
      GoRoute(
        path: '/offline',
        builder: (context, state) => OfflineSessionScreen(manager: session),
      ),
      GoRoute(
        path: '/auth',
        builder: (context, state) => LamsaAuthScreen(
          manager: session,
          audienceLabel: context.lamsa.expertApp,
          accent: LamsaColors.plumDark,
          initialMessage: switch (session.phase) {
            SessionPhase.expired => context.lamsa.sessionExpired,
            SessionPhase.wrongRole => context.lamsa.expertWrongRole,
            _ => null,
          },
        ),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => ExpertProfileScreen(
          manager: session,
          api: ref.read(expertApiProvider),
        ),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

class ExpertApp extends ConsumerWidget {
  const ExpertApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final network = ref.watch(networkStateProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'لمسة خبيرة',
      locale: const Locale('ar'),
      supportedLocales: LamsaLocalizations.supportedLocales,
      localizationsDelegates: LamsaLocalizations.localizationsDelegates,
      theme: LamsaTheme.light(seed: LamsaColors.plumDark),
      routerConfig: router,
      builder: (context, child) => LamsaNetworkBanner(
        isOnline: network.value,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
