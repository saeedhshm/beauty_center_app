import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

import 'workspace_shell.dart';

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
final expertWorkspaceApiProvider = Provider<ExpertWorkspaceGateway>(
  (ref) => ExpertWorkspaceApi(ref.watch(authenticatedApiClientProvider)),
);
final catalogApiProvider = Provider<CatalogGateway>(
  (ref) => CatalogApi(ref.watch(authenticatedApiClientProvider)),
);
final availabilityApiProvider = Provider<AvailabilityGateway>(
  (ref) => AvailabilityApi(ref.watch(authenticatedApiClientProvider)),
);
final bookingApiProvider = Provider<BookingGateway>(
  (ref) => BookingApi(ref.watch(authenticatedApiClientProvider)),
);
final reviewApiProvider = Provider<ReviewGateway>(
  (ref) => ReviewApi(ref.watch(authenticatedApiClientProvider)),
);
final notificationApiProvider = Provider<NotificationGateway>(
  (ref) => NotificationApi(ref.watch(authenticatedApiClientProvider)),
);
final earningApiProvider = Provider<EarningGateway>(
  (ref) => EarningApi(ref.watch(authenticatedApiClientProvider)),
);

final pushRegistrarProvider = Provider<PushRegistrar>(
  (ref) {
    final registrar = PushRegistrar(
      provider: FirebasePushProvider(),
      gateway: ref.watch(notificationApiProvider),
    );
    ref.onDispose(() async {
      await registrar.dispose();
    });
    return registrar;
  },
);

/// Bridges session transitions to the device-token lifecycle. Permission is
/// requested only after a real login; logout removes the token best-effort.
final pushSyncProvider = Provider<void>((ref) {
  SessionPhase? previous;
  void sync() {
    final manager = ref.read(sessionManagerProvider);
    final registrar = ref.read(pushRegistrarProvider);
    final authenticated = manager.isAuthenticated;
    if (authenticated && previous != SessionPhase.authenticated) {
      unawaited(registrar.syncOnLogin());
    } else if (!authenticated &&
        previous == SessionPhase.authenticated) {
      unawaited(registrar.syncOnLogout());
    }
    previous = manager.phase;
  }

  sync();
  ref.listen(sessionManagerProvider, (_, _) => sync());
});


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
          location == '/workspace' ? null : '/workspace',
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
        path: '/workspace',
        builder: (context, state) => ExpertWorkspaceShell(
          manager: session,
          expertApi: ref.read(expertApiProvider),
          workspaceApi: ref.read(expertWorkspaceApiProvider),
          catalogApi: ref.read(catalogApiProvider),
          availabilityApi: ref.read(availabilityApiProvider),
          bookingApi: ref.read(bookingApiProvider),
          reviewApi: ref.read(reviewApiProvider),
          notificationApi: ref.read(notificationApiProvider),
          earningApi: ref.read(earningApiProvider),
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
    ref.watch(pushSyncProvider);
    final router = ref.watch(appRouterProvider);
    final network = ref.watch(networkStateProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      onGenerateTitle: (context) => context.lamsa.expertApp,
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
