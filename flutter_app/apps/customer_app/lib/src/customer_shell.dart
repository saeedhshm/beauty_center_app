import 'package:flutter/material.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_localization/lamsa_localization.dart';

import 'addresses_screen.dart';
import 'bookings_screen.dart';
import 'notifications_screen.dart';
import 'catalog_screen.dart';

class CustomerShell extends StatefulWidget {
  const CustomerShell({
    required this.manager,
    required this.accountApi,
    required this.catalogApi,
    required this.addressApi,
    required this.availabilityApi,
    required this.bookingApi,
    required this.paymentApi,
    required this.reviewApi,
    required this.notificationApi,
    this.onBookingOpenerReady,
    super.key,
  });

  /// Receives this shell's booking opener so a push can navigate from
  /// anywhere in the app while the workspace is alive.
  final void Function(Future<void> Function(String bookingId))?
  onBookingOpenerReady;

  final SessionManager manager;
  final AccountGateway accountApi;
  final CatalogGateway catalogApi;
  final AddressGateway addressApi;
  final AvailabilityGateway availabilityApi;
  final BookingGateway bookingApi;
  final PaymentGateway paymentApi;
  final ReviewGateway reviewApi;
  final NotificationGateway notificationApi;

  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int _destination = 0;

  @override
  void initState() {
    super.initState();
    widget.onBookingOpenerReady?.call(_openBooking);
  }

  /// Opens the referenced booking through the detail screen, which fetches it
  /// fresh from the API: a booking that is not this customer's comes back as a
  /// server 404 and shows nothing.
  Future<void> _openBooking(String bookingId) async {
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BookingDetailScreen(
          bookings: widget.bookingApi,
          payments: widget.paymentApi,
          reviews: widget.reviewApi,
          currentUserId: widget.manager.user?.id,
          bookingId: bookingId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final destinations = [
      NavigationDestination(
        icon: const Icon(Icons.storefront_outlined),
        selectedIcon: const Icon(Icons.storefront),
        label: context.lamsa.catalog,
      ),
      NavigationDestination(
        icon: const Icon(Icons.location_on_outlined),
        selectedIcon: const Icon(Icons.location_on),
        label: context.lamsa.addresses,
      ),
      NavigationDestination(
        icon: const Icon(Icons.receipt_long_outlined),
        selectedIcon: const Icon(Icons.receipt_long),
        label: context.lamsa.myBookings,
      ),
      NavigationDestination(
        icon: const Icon(Icons.notifications_outlined),
        selectedIcon: const Icon(Icons.notifications),
        label: context.lamsa.notifications,
      ),
      NavigationDestination(
        icon: const Icon(Icons.person_outline),
        selectedIcon: const Icon(Icons.person),
        label: context.lamsa.account,
      ),
    ];
    final pages = [
      CatalogScreen(
        gateway: widget.catalogApi,
        availability: widget.availabilityApi,
        addresses: widget.addressApi,
        bookings: widget.bookingApi,
        payments: widget.paymentApi,
        reviews: widget.reviewApi,
        currentUserId: widget.manager.user?.id,
      ),
      AddressesScreen(
        gateway: widget.addressApi,
        catalogGateway: widget.catalogApi,
      ),
      CustomerBookingsScreen(
        bookings: widget.bookingApi,
        payments: widget.paymentApi,
        reviews: widget.reviewApi,
        currentUserId: widget.manager.user?.id,
      ),
      CustomerNotificationsScreen(
        notifications: widget.notificationApi,
        bookings: widget.bookingApi,
        payments: widget.paymentApi,
        reviews: widget.reviewApi,
        currentUserId: widget.manager.user?.id,
      ),
      LamsaAccountScreen(
        manager: widget.manager,
        api: widget.accountApi,
        title: context.lamsa.customerApp,
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 800) {
          return Scaffold(
            body: Row(
              children: [
                SafeArea(
                  child: NavigationRail(
                    selectedIndex: _destination,
                    onDestinationSelected: _select,
                    labelType: NavigationRailLabelType.all,
                    destinations: [
                      for (final destination in destinations)
                        NavigationRailDestination(
                          icon: destination.icon,
                          selectedIcon: destination.selectedIcon,
                          label: Text(destination.label),
                        ),
                    ],
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(
                  child: IndexedStack(index: _destination, children: pages),
                ),
              ],
            ),
          );
        }
        return Scaffold(
          body: IndexedStack(index: _destination, children: pages),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _destination,
            onDestinationSelected: _select,
            destinations: destinations,
          ),
        );
      },
    );
  }

  void _select(int value) => setState(() => _destination = value);
}
