import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'booking_detail_screen.dart';

/// Permanent home for the expert's finished bookings: completed plus the past
/// terminal states, each one server-filtered and server-paginated through
/// `GET /bookings`. No new endpoint, no new booking state, and nothing here
/// mutates: opening a row pushes [ExpertBookingDetailScreen], which refetches
/// `GET /bookings/:id`, so a row DTO is never treated as current state.
///
/// The status filter is one of the seven server booking states. A booking that
/// is still pending, accepted, or confirmed is intentionally absent here and
/// stays in the requests tab.
class ExpertPastBookingsScreen extends StatefulWidget {
  const ExpertPastBookingsScreen({
    required this.bookings,
    this.reviews,
    this.currentUserId,
    this.refreshSignal,
    super.key,
  });

  final BookingGateway bookings;
  final ReviewGateway? reviews;
  final String? currentUserId;
  final Listenable? refreshSignal;

  static const pastStatuses = <String>[
    BookingStates.completed,
    BookingStates.cancelled,
    BookingStates.rejected,
    BookingStates.expired,
  ];

  @override
  State<ExpertPastBookingsScreen> createState() =>
      _ExpertPastBookingsScreenState();
}

class _ExpertPastBookingsScreenState extends State<ExpertPastBookingsScreen>
    with WidgetsBindingObserver {
  /// Discards responses from a previous filter or a previous page so a slow
  /// answer can never append into the list the user is looking at now.
  int _generation = 0;
  String _status = BookingStates.completed;
  List<Booking> _items = const [];
  int _page = 0;
  bool _hasNext = false;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_load);
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didUpdateWidget(covariant ExpertPastBookingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshSignal != widget.refreshSignal) {
      oldWidget.refreshSignal?.removeListener(_load);
      widget.refreshSignal?.addListener(_load);
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_load);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    final status = _status;
    if (!mounted) return;
    setState(() {
      _items = const [];
      _page = 0;
      _hasNext = false;
      _error = null;
      _loading = true;
      _loadingMore = false;
    });
    try {
      final result = await widget.bookings.bookings(status: status, page: 1);
      if (!_isCurrent(generation, status)) return;
      setState(() {
        _items = result.items;
        _page = result.page;
        _hasNext = result.hasNext;
        _loading = false;
      });
    } catch (error) {
      if (!_isCurrent(generation, status)) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final generation = _generation;
    final status = _status;
    final page = _page;
    if (_loadingMore || !_hasNext || _loading || _error != null) return;
    setState(() => _loadingMore = true);
    try {
      final result = await widget.bookings.bookings(
        status: status,
        page: page + 1,
      );
      if (!_isCurrent(generation, status) || _page != page) return;
      setState(() {
        _items = [..._items, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (_isCurrent(generation, status)) setState(() => _error = error);
    } finally {
      if (_isCurrent(generation, status)) setState(() => _loadingMore = false);
    }
  }

  bool _isCurrent(int generation, String status) =>
      mounted && generation == _generation && status == _status;

  Future<void> _selectStatus(String status) async {
    if (status == _status) return;
    setState(() => _status = status);
    await _load();
  }

  Future<void> _open(Booking booking) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ExpertBookingDetailScreen(
          bookings: widget.bookings,
          reviews: widget.reviews,
          currentUserId: widget.currentUserId,
          bookingId: booking.id,
        ),
      ),
    );
    // The detail screen may have recorded a review or the booking may have
    // moved, so the list is re-read rather than patched locally.
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _error == null && _items.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.pastBookings,
        message: context.lamsa.loadingPastBookings,
      );
    }
    if (_error != null && _items.isEmpty) {
      final failure = _error is ApiFailure ? _error! as ApiFailure : null;
      return LamsaStatusView(
        status: failure?.kind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.pastBookings,
        message: switch (failure?.kind) {
          ApiFailureKind.unauthorized => context.lamsa.sessionExpired,
          ApiFailureKind.forbidden => context.lamsa.forbiddenTitle,
          _ => failure?.message ?? context.lamsa.tryAgain,
        },
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final status in ExpertPastBookingsScreen.pastStatuses)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ChoiceChip(
                      key: ValueKey('past-filter-$status'),
                      label: Text(context.lamsa.bookingStatusName(status)),
                      selected: _status == status,
                      onSelected: (_) => _selectStatus(status),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (_error != null)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      _error is ApiFailure
                          ? (_error! as ApiFailure).message
                          : context.lamsa.tryAgain,
                      key: const ValueKey('past-error'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      key: const ValueKey('past-retry'),
                      onPressed: _load,
                      child: Text(context.lamsa.retry),
                    ),
                  ],
                ),
              ),
            )
          else if (_items.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.pastBookings,
              message: context.lamsa.noPastBookings,
            )
          else
            for (final booking in _items)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  key: ValueKey('past-${booking.id}'),
                  title: Text(
                    '${context.lamsa.bookingStatusName(booking.status)} · ${booking.totalAmount} ${booking.currency}',
                  ),
                  subtitle: Text(
                    formatBookingDateTime(booking.startsAt, booking.timeZone),
                    textDirection: TextDirection.ltr,
                  ),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => _open(booking),
                ),
              ),
          if (_hasNext && _error == null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton(
                key: const ValueKey('past-load-more'),
                onPressed: _loadingMore ? null : _loadMore,
                child: _loadingMore
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(context.lamsa.loadMore),
              ),
            ),
        ],
      ),
    );
  }
}
