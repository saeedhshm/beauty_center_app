import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'cairo_slot_time.dart';

const _visibleStatuses = [
  'pending',
  'accepted',
  'confirmed',
  'completed',
  'rejected',
  'cancelled',
  'expired',
];

/// Customer bookings list (A5): server states only, refetched on resume.
class CustomerBookingsScreen extends StatefulWidget {
  const CustomerBookingsScreen({
    required this.bookings,
    this.refreshSignal,
    super.key,
  });

  final BookingGateway bookings;
  final Listenable? refreshSignal;

  @override
  State<CustomerBookingsScreen> createState() => _CustomerBookingsScreenState();
}

class _CustomerBookingsScreenState extends State<CustomerBookingsScreen>
    with WidgetsBindingObserver {
  String? _status;
  int _page = 1;
  List<Booking> _items = const [];
  bool _hasNext = false;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_reload);
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didUpdateWidget(covariant CustomerBookingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshSignal != widget.refreshSignal) {
      oldWidget.refreshSignal?.removeListener(_reload);
      widget.refreshSignal?.addListener(_reload);
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_reload);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _reload();
  }

  Future<void> _reload() => _load(reset: true);

  Future<void> _load({bool reset = false}) async {
    if (!mounted) return;
    setState(() {
      if (reset) {
        _page = 1;
        _items = const [];
      }
      _loading = reset || _page == 1 && _items.isEmpty;
      _error = null;
    });
    try {
      final result = await widget.bookings.bookings(
        status: _status,
        page: reset ? 1 : _page,
      );
      if (!mounted) return;
      setState(() {
        _items = reset ? result.items : [..._items, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
        _loading = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error;
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasNext) return;
    setState(() => _loadingMore = true);
    try {
      final result = await widget.bookings.bookings(
        status: _status,
        page: _page + 1,
      );
      if (!mounted) return;
      setState(() {
        _items = [..._items, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
        _loadingMore = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _loadingMore = false;
          _error = error;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _error == null && _items.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.myBookings,
        message: context.lamsa.loadingBookings,
      );
    }
    if (_error != null && _items.isEmpty) {
      return LamsaStatusView(
        status: _error is ApiFailure &&
                (_error! as ApiFailure).kind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.myBookings,
        message: _error is ApiFailure
            ? (_error! as ApiFailure).message
            : context.lamsa.tryAgain,
        onRetry: _reload,
      );
    }
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  key: const ValueKey('bookings-filter-all'),
                  label: Text(context.lamsa.all),
                  selected: _status == null,
                  onSelected: (_) {
                    setState(() => _status = null);
                    _reload();
                  },
                ),
                const SizedBox(width: 8),
                for (final status in _visibleStatuses)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ChoiceChip(
                      key: ValueKey('bookings-filter-$status'),
                      label: Text(context.lamsa.bookingStatusName(status)),
                      selected: _status == status,
                      onSelected: (_) {
                        setState(() => _status = status);
                        _reload();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (_items.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.myBookings,
              message: context.lamsa.noBookingsHint,
            ),
          for (final booking in _items)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                key: ValueKey('booking-${booking.id}'),
                title: Text(
                  '${context.lamsa.bookingStatusName(booking.status)} · ${booking.totalAmount} ${booking.currency}',
                ),
                subtitle: Text(
                  '${cairoDateOf(DateTime.parse(booking.startsAt))} · ${cairoClockOf(booking.startsAt)}',
                  textDirection: TextDirection.ltr,
                ),
                trailing: const Icon(Icons.chevron_left),
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => BookingDetailScreen(
                        bookings: widget.bookings,
                        bookingId: booking.id,
                      ),
                    ),
                  );
                  if (mounted) _reload();
                },
              ),
            ),
          if (_error != null && _items.isNotEmpty)
            TextButton(onPressed: _loadMore, child: Text(context.lamsa.retry)),
          if (_hasNext)
            LamsaButton(
              key: const Key('bookings-load-more'),
              label: context.lamsa.loadMore,
              loading: _loadingMore,
              onPressed: _loadingMore ? null : _loadMore,
            ),
        ],
      ),
    );
  }
}

/// Booking detail with status history, expiry, and allowed cancellation.
class BookingDetailScreen extends StatefulWidget {
  const BookingDetailScreen({
    required this.bookings,
    required this.bookingId,
    super.key,
  });

  final BookingGateway bookings;
  final String bookingId;

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen>
    with WidgetsBindingObserver {
  Booking? _booking;
  Object? _error;
  bool _cancelling = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _error = null);
    try {
      final booking = await widget.bookings.booking(widget.bookingId);
      if (mounted) setState(() => _booking = booking);
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _cancel() async {
    final booking = _booking;
    if (booking == null || _cancelling) return;
    final reason = await _requestReason(context);
    if (reason == null || !mounted) return;
    setState(() => _cancelling = true);
    try {
      final updated = await widget.bookings.cancel(
        booking.id,
        reason: reason.isEmpty ? null : reason,
      );
      if (!mounted) return;
      setState(() {
        _booking = updated;
        _cancelling = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.bookingCancelled)),
        );
      }
      await _load();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _cancelling = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            failure.kind == ApiFailureKind.conflict
                ? context.lamsa.bookingStateChanged
                : failure.message,
          ),
        ),
      );
      await _load();
    } on Object {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.lamsa.bookingDetail)),
      body: SafeArea(
        child: _booking == null && _error == null
            ? LamsaStatusView(
                status: LamsaStatus.loading,
                title: context.lamsa.bookingDetail,
                message: context.lamsa.loadingBooking,
              )
            : _booking == null
            ? LamsaStatusView(
                status: LamsaStatus.error,
                title: context.lamsa.bookingDetail,
                message: _error is ApiFailure
                    ? (_error! as ApiFailure).message
                    : context.lamsa.tryAgain,
                onRetry: _load,
              )
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(LamsaSpacing.lg),
                  children: [
                    _row(
                      context.lamsa.bookingStatus,
                      context.lamsa.bookingStatusName(_booking!.status),
                    ),
                    _row(
                      context.lamsa.appointmentTime,
                      '${cairoDateOf(DateTime.parse(_booking!.startsAt))} · ${cairoClockOf(_booking!.startsAt)} – ${cairoClockOf(_booking!.endsAt)}',
                    ),
                    _row(
                      context.lamsa.totalAmount,
                      '${_booking!.totalAmount} ${_booking!.currency}',
                    ),
                    _row(
                      context.lamsa.priceDetails,
                      '${context.lamsa.price}: ${_booking!.price} · ${context.lamsa.commission}: ${_booking!.commissionAmount} · ${context.lamsa.tax}: ${_booking!.vatAmount}',
                    ),
                    if (_booking!.expiresAt != null &&
                        (_booking!.isPending || _booking!.isAccepted))
                      _row(
                        context.lamsa.pendingExpiry,
                        cairoClockOf(_booking!.expiresAt!),
                      ),
                    if (_booking!.notes != null &&
                        _booking!.notes!.isNotEmpty)
                      _row(context.lamsa.notesOptional, _booking!.notes!),
                    if (_booking!.cancellationReason != null &&
                        _booking!.cancellationReason!.isNotEmpty)
                      _row(
                        context.lamsa.cancellationReason,
                        _booking!.cancellationReason!,
                      ),
                    const SizedBox(height: 12),
                    Text(
                      context.lamsa.statusHistory,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    for (final entry in _booking!.statusHistory)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(
                          context.lamsa.bookingStatusName(entry.status),
                        ),
                        subtitle: Text(entry.changedAt),
                      ),
                    if (_booking!.isPending || _booking!.isAccepted) ...[
                      const SizedBox(height: 12),
                      OutlinedButton(
                        key: const ValueKey('booking-cancel'),
                        onPressed: _cancelling ? null : _cancel,
                        child: Text(context.lamsa.cancelBooking),
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        Expanded(child: Text(value)),
      ],
    ),
  );
}

/// Sentinel distinguishing dialog dismissal from an empty optional reason.
const _reasonAborted = 'aborted';

/// Returns the trimmed reason, empty string for "no reason", or null when the
/// dialog was dismissed without confirming.
Future<String?> _requestReason(BuildContext context) async {
  final result = await showDialog<Object?>(
    context: context,
    builder: (dialogContext) => const _ReasonDialog(),
  );
  if (identical(result, _reasonAborted) || result == null) return null;
  final reason = (result as String).trim();
  return reason;
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog();

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.lamsa.cancelBooking),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(context.lamsa.cancelBookingConfirm),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('cancel-reason'),
          controller: _controller,
          maxLength: 500,
          decoration: InputDecoration(
            labelText: context.lamsa.cancelReasonOptional,
          ),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(_reasonAborted),
        child: Text(context.lamsa.cancel),
      ),
      FilledButton(
        key: const ValueKey('cancel-confirm'),
        onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
        child: Text(context.lamsa.cancelBooking),
      ),
    ],
  );
}
