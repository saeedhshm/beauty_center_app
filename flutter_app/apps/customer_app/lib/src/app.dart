import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'customer_shell.dart';

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
  (ref) => SecureSessionStore(namespace: 'lamsa_customer'),
);
final sessionManagerProvider = Provider<SessionManager>((ref) {
  final manager = SessionManager(
    expectedRole: AuthRole.customer,
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
final accountApiProvider = Provider<AccountGateway>(
  (ref) => AccountApi(ref.watch(authenticatedApiClientProvider)),
);
final catalogApiProvider = Provider<CatalogGateway>(
  (ref) => CatalogApi(ref.watch(rawApiClientProvider)),
);
final addressApiProvider = Provider<AddressGateway>(
  (ref) => AddressApi(ref.watch(authenticatedApiClientProvider)),
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
        SessionPhase.authenticated => location == '/home' ? null : '/home',
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
          audienceLabel: context.lamsa.customerApp,
          initialMessage: switch (session.phase) {
            SessionPhase.expired => context.lamsa.sessionExpired,
            SessionPhase.wrongRole => context.lamsa.customerWrongRole,
            _ => null,
          },
        ),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => CustomerShell(
          manager: session,
          accountApi: ref.read(accountApiProvider),
          catalogApi: ref.read(catalogApiProvider),
          addressApi: ref.read(addressApiProvider),
        ),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

class CustomerApp extends ConsumerWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final network = ref.watch(networkStateProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'لمسة',
      locale: const Locale('ar'),
      supportedLocales: LamsaLocalizations.supportedLocales,
      localizationsDelegates: LamsaLocalizations.localizationsDelegates,
      theme: LamsaTheme.light(),
      routerConfig: router,
      builder: (context, child) => LamsaNetworkBanner(
        isOnline: network.value,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
