import 'package:flutter/material.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

import 'availability_screen.dart';
import 'booking_detail_screen.dart';
import 'expert_profile_screen.dart';
import 'earnings_screen.dart';
import 'notifications_screen.dart';
import 'past_bookings_screen.dart';
import 'requests_screen.dart';
import 'portfolio_screen.dart';
import 'services_screen.dart';

class ExpertWorkspaceShell extends StatefulWidget {
  const ExpertWorkspaceShell({
    required this.manager,
    required this.expertApi,
    required this.workspaceApi,
    required this.catalogApi,
    required this.availabilityApi,
    required this.bookingApi,
    required this.reviewApi,
    required this.notificationApi,
    required this.earningApi,
    this.onBookingOpenerReady,
    super.key,
  });

  /// Receives this shell's booking opener so a push can navigate from
  /// anywhere in the app while the workspace is alive.
  final void Function(Future<void> Function(String bookingId))?
  onBookingOpenerReady;

  final SessionManager manager;
  final ExpertGateway expertApi;
  final ExpertWorkspaceGateway workspaceApi;
  final CatalogGateway catalogApi;
  final AvailabilityGateway availabilityApi;
  final BookingGateway bookingApi;
  final ReviewGateway reviewApi;
  final NotificationGateway notificationApi;
  final EarningGateway earningApi;

  @override
  State<ExpertWorkspaceShell> createState() => _ExpertWorkspaceShellState();
}

class _ExpertWorkspaceShellState extends State<ExpertWorkspaceShell>
    with WidgetsBindingObserver {
  int _index = 0;
  final _refreshSignal = ValueNotifier<int>(0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.onBookingOpenerReady?.call(_openBooking);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshSignal.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final destinations = [
      NavigationDestination(
        icon: const Icon(Icons.person_outline),
        selectedIcon: const Icon(Icons.person),
        label: context.lamsa.expertProfile,
      ),
      NavigationDestination(
        icon: const Icon(Icons.spa_outlined),
        selectedIcon: const Icon(Icons.spa),
        label: context.lamsa.servicesAndPrices,
      ),
      NavigationDestination(
        icon: const Icon(Icons.photo_library_outlined),
        selectedIcon: const Icon(Icons.photo_library),
        label: context.lamsa.portfolio,
      ),
      NavigationDestination(
        icon: const Icon(Icons.schedule_outlined),
        selectedIcon: const Icon(Icons.schedule),
        label: context.lamsa.availability,
      ),
      NavigationDestination(
        icon: const Icon(Icons.inbox_outlined),
        selectedIcon: const Icon(Icons.inbox),
        label: context.lamsa.bookingRequests,
      ),
      NavigationDestination(
        icon: const Icon(Icons.history_outlined),
        selectedIcon: const Icon(Icons.history),
        label: context.lamsa.pastBookings,
      ),
      NavigationDestination(
        icon: const Icon(Icons.notifications_outlined),
        selectedIcon: const Icon(Icons.notifications),
        label: context.lamsa.notifications,
      ),
      NavigationDestination(
        icon: const Icon(Icons.account_balance_wallet_outlined),
        selectedIcon: const Icon(Icons.account_balance_wallet),
        label: context.lamsa.earnings,
      ),
    ];
    final pages = [
      ExpertProfileScreen(
        manager: widget.manager,
        api: widget.expertApi,
        embedded: true,
        refreshSignal: _refreshSignal,
      ),
      ExpertServicesScreen(
        workspace: widget.workspaceApi,
        catalog: widget.catalogApi,
        refreshSignal: _refreshSignal,
      ),
      PortfolioScreen(
        workspace: widget.workspaceApi,
        expertId: widget.manager.user!.id,
        refreshSignal: _refreshSignal,
      ),
      ExpertAvailabilityScreen(
        availability: widget.availabilityApi,
        refreshSignal: _refreshSignal,
      ),
      ExpertRequestsScreen(
        bookings: widget.bookingApi,
        reviews: widget.reviewApi,
        currentUserId: widget.manager.user?.id,
        refreshSignal: _refreshSignal,
      ),
      ExpertPastBookingsScreen(
        bookings: widget.bookingApi,
        reviews: widget.reviewApi,
        currentUserId: widget.manager.user?.id,
        refreshSignal: _refreshSignal,
      ),
      ExpertNotificationsScreen(
        notifications: widget.notificationApi,
        onOpenBooking: (bookingId) => _openBooking(bookingId),
        refreshSignal: _refreshSignal,
      ),
      ExpertEarningsScreen(
        earnings: widget.earningApi,
        refreshSignal: _refreshSignal,
      ),
    ];
    final wide = MediaQuery.sizeOf(context).width >= 760;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.lamsa.expertWorkspace),
        actions: [
          IconButton(
            key: const ValueKey('workspace-refresh'),
            tooltip: context.lamsa.retry,
            onPressed: _refresh,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: context.lamsa.logout,
            onPressed: widget.manager.logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: wide
            ? Row(
                children: [
                  NavigationRail(
                    selectedIndex: _index,
                    onDestinationSelected: _select,
                    labelType: NavigationRailLabelType.all,
                    destinations: destinations
                        .map(
                          (item) => NavigationRailDestination(
                            icon: item.icon,
                            selectedIcon: item.selectedIcon,
                            label: Text(item.label),
                          ),
                        )
                        .toList(growable: false),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(
                    child: IndexedStack(index: _index, children: pages),
                  ),
                ],
              )
            : IndexedStack(index: _index, children: pages),
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: _select,
              destinations: destinations,
            ),
    );
  }

  void _select(int value) => setState(() => _index = value);

  void _refresh() => _refreshSignal.value += 1;

  /// Opens the authoritative detail for a validated booking id, then
  /// refreshes notifications and requests on return so read states and
  /// moved bookings settle everywhere.
  Future<void> _openBooking(String bookingId) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ExpertBookingDetailScreen(
          bookings: widget.bookingApi,
          reviews: widget.reviewApi,
          currentUserId: widget.manager.user?.id,
          bookingId: bookingId,
        ),
      ),
    );
    _refresh();
  }
}
