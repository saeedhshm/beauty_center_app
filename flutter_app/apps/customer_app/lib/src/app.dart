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
final bookingApiProvider = Provider<BookingGateway>(
  (ref) => BookingApi(ref.watch(authenticatedApiClientProvider)),
);
final paymentApiProvider = Provider<PaymentGateway>(
  (ref) => PaymentApi(ref.watch(authenticatedApiClientProvider)),
);
final reviewApiProvider = Provider<ReviewGateway>(
  (ref) => ReviewApi(ref.watch(authenticatedApiClientProvider)),
);
final notificationApiProvider = Provider<NotificationGateway>(
  (ref) => NotificationApi(ref.watch(authenticatedApiClientProvider)),
);

final pushRegistrarProvider = Provider<PushRegistrar>((ref) {
  final registrar = PushRegistrar(
    provider: FirebasePushProvider(),
    gateway: ref.watch(notificationApiProvider),
  );
  ref.onDispose(() async {
    await registrar.dispose();
  });
  return registrar;
});

/// Binds [SessionManager] transitions to the device-token lifecycle through
/// [PushSessionSync], which subscribes to the manager itself (a plain
/// provider value never changes for a ChangeNotifier). Permission is
/// requested only after a real login.
/// Holds the workspace booking opener so a push can navigate from anywhere
/// once the workspace is mounted. A plain holder keeps this free of Riverpod
/// legacy state providers.
class BookingOpenerHolder {
  Future<void> Function(String bookingId)? open;
}

final bookingOpenerHolderProvider = Provider<BookingOpenerHolder>(
  (ref) => BookingOpenerHolder(),
);

/// Routes a received push to the booking screen once the session allows it.
/// The booking is always fetched fresh from the API by the detail screen, so a
/// resource that is not this user's stays a server 404.
final pushCoordinatorProvider = Provider<PushCoordinator>((ref) {
  final coordinator = PushCoordinator(
    provider: ref.watch(pushRegistrarProvider).provider,
    session: ref.watch(sessionManagerProvider),
    onOpenBooking: (bookingId) async {
      // No workspace yet (still restoring or signed out): nothing opens.
      final open = ref.read(bookingOpenerHolderProvider).open;
      if (open == null) return;
      await open(bookingId);
    },
  );
  unawaited(coordinator.attach());
  ref.onDispose(() => coordinator.dispose());
  return coordinator;
});

final pushSyncProvider = Provider<void>((ref) {
  final sync = PushSessionSync(
    manager: ref.watch(sessionManagerProvider),
    registrar: ref.read(pushRegistrarProvider),
    // Connectivity is an existing signal; a failed registration retries when
    // the network comes back, and again when the app is resumed.
    connectivityChanges: ref.read(networkMonitorProvider).changes,
  );
  sync.attach();
  ref.onDispose(() async {
    await sync.dispose();
  });
});

final availabilityApiProvider = Provider<AvailabilityGateway>(
  (ref) => AvailabilityApi(ref.watch(rawApiClientProvider)),
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
          availabilityApi: ref.read(availabilityApiProvider),
          bookingApi: ref.read(bookingApiProvider),
          paymentApi: ref.read(paymentApiProvider),
          reviewApi: ref.read(reviewApiProvider),
          notificationApi: ref.read(notificationApiProvider),
          onBookingOpenerReady: (open) =>
              ref.read(bookingOpenerHolderProvider).open = open,
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
    ref.watch(pushSyncProvider);
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
