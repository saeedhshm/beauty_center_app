import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:uuid/uuid.dart';

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
    required this.payments,
    required this.reviews,
    this.currentUserId,
    this.refreshSignal,
    super.key,
  });

  final BookingGateway bookings;
  final PaymentGateway payments;
  final ReviewGateway reviews;
  final String? currentUserId;
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
  int _requestGeneration = 0;

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
    final generation = reset ? ++_requestGeneration : _requestGeneration;
    final status = _status;
    final page = reset ? 1 : _page;
    if (!mounted) return;
    setState(() {
      if (reset) {
        _page = 1;
        _items = const [];
        _loadingMore = false;
      }
      _loading = reset || _page == 1 && _items.isEmpty;
      _error = null;
    });
    try {
      final result = await widget.bookings.bookings(status: status, page: page);
      if (!_isCurrentBookingsRequest(generation, status)) return;
      setState(() {
        _items = reset ? result.items : [..._items, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
        _loading = false;
      });
    } catch (error) {
      if (_isCurrentBookingsRequest(generation, status)) {
        setState(() {
          _error = error;
          _loading = false;
        });
      }
    } finally {
      if (_isCurrentBookingsRequest(generation, status)) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final generation = _requestGeneration;
    final status = _status;
    final page = _page;
    if (_loadingMore || !_hasNext) return;
    setState(() {
      _loadingMore = true;
      _error = null;
    });
    try {
      final result = await widget.bookings.bookings(
        status: status,
        page: page + 1,
      );
      if (!_isCurrentBookingsRequest(generation, status) || _page != page) {
        return;
      }
      setState(() {
        _items = [..._items, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (_isCurrentBookingsRequest(generation, status) && _page == page) {
        setState(() => _error = error);
      }
    } finally {
      if (_isCurrentBookingsRequest(generation, status) && _page == page) {
        setState(() => _loadingMore = false);
      }
    }
  }

  bool _isCurrentBookingsRequest(int generation, String? status) =>
      mounted && generation == _requestGeneration && status == _status;

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
        status:
            _error is ApiFailure &&
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
                  formatBookingDateTime(booking.startsAt, booking.timeZone),
                  textDirection: TextDirection.ltr,
                ),
                trailing: const Icon(Icons.chevron_left),
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => BookingDetailScreen(
                        bookings: widget.bookings,
                        payments: widget.payments,
                        reviews: widget.reviews,
                        currentUserId: widget.currentUserId,
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
    required this.payments,
    required this.reviews,
    this.currentUserId,
    required this.bookingId,
    super.key,
  });

  final BookingGateway bookings;
  final PaymentGateway payments;
  final ReviewGateway reviews;
  final String? currentUserId;
  final String bookingId;

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen>
    with WidgetsBindingObserver {
  Booking? _booking;
  Object? _error;
  bool _cancelling = false;
  List<BookingPayment> _attempts = const [];
  Object? _attemptsError;
  bool _paying = false;
  List<BookingReview> _reviews = const [];
  Object? _reviewsError;
  bool _completing = false;
  int _rating = 5;
  String _comment = '';
  bool _submittingReview = false;

  /// Guards every read of this screen. A response may only write state when it
  /// belongs to the newest load, so an older, slower reply can never overwrite
  /// a newer one. HTTP cancellation is not used as the guarantee: the request
  /// is allowed to finish and is then discarded by generation.
  int _generation = 0;

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

  /// Reads the booking, then its payment attempts and reviews.
  ///
  /// The booking is the authority: if it cannot be read, the previous snapshot
  /// is dropped so cancel, pay, and complete never act on a state the server
  /// refused to confirm. Auxiliary sections fail independently and keep their
  /// last value behind an explicit "not refreshed" flag instead of pretending
  /// an empty list.
  Future<void> _load() async {
    final generation = ++_generation;
    if (!mounted) return;
    setState(() => _error = null);
    try {
      final booking = await widget.bookings.booking(widget.bookingId);
      if (!_isCurrent(generation)) return;
      setState(() => _booking = booking);
    } catch (error) {
      if (!_isCurrent(generation)) return;
      setState(() {
        _booking = null;
        _attempts = const [];
        _attemptsError = null;
        _reviews = const [];
        _reviewsError = null;
        _error = error;
      });
      return;
    }
    await Future.wait([_loadAttempts(generation), _loadReviews(generation)]);
  }

  Future<void> _loadAttempts(int generation) async {
    try {
      final attempts = await widget.payments.attempts(widget.bookingId);
      if (!_isCurrent(generation)) return;
      if (mounted) {
        setState(() {
          _attempts = attempts;
          _attemptsError = null;
        });
      }
    } catch (error) {
      if (!_isCurrent(generation)) return;
      if (mounted) setState(() => _attemptsError = error);
    }
  }

  Future<void> _loadReviews(int generation) async {
    try {
      final reviews = await widget.reviews.forBooking(widget.bookingId);
      if (!_isCurrent(generation)) return;
      if (mounted) {
        setState(() {
          _reviews = reviews;
          _reviewsError = null;
        });
      }
    } catch (error) {
      if (!_isCurrent(generation)) return;
      if (mounted) setState(() => _reviewsError = error);
    }
  }

  bool _isCurrent(int generation) => mounted && generation == _generation;

  Future<void> _complete() async {
    final booking = _booking;
    if (booking == null || _completing || !mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(dialogContext.lamsa.completeBooking),
        content: Text(dialogContext.lamsa.completeBookingConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.lamsa.cancel),
          ),
          FilledButton(
            key: const ValueKey('complete-confirm'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.lamsa.completeBooking),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _completing = true);
    try {
      await widget.bookings.complete(booking.id);
      if (!mounted) return;
      setState(() => _completing = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.lamsa.bookingCompleted)));
      await _load();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _completing = false);
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
      if (mounted) setState(() => _completing = false);
    }
  }

  Future<void> _submitReview() async {
    if (_submittingReview || !mounted) return;
    setState(() => _submittingReview = true);
    try {
      await widget.reviews.submit(
        widget.bookingId,
        rating: _rating,
        comment: _comment.isEmpty ? null : _comment,
      );
      if (!mounted) return;
      setState(() => _submittingReview = false);
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(content: Text(context.lamsa.reviewSubmitted)),
      );
      await _load();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _submittingReview = false);
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            failure.code == 'DUPLICATE_REVIEW'
                ? context.lamsa.alreadyReviewed
                : failure.kind == ApiFailureKind.conflict
                ? context.lamsa.bookingStateChanged
                : failure.message,
          ),
        ),
      );
      await _load();
    } on Object {
      if (mounted) setState(() => _submittingReview = false);
    }
  }

  /// Demo payment flow (A6): initiate, simulate an outcome on an explicitly
  /// labeled demo sheet, then refetch. Confirmation is shown only from the
  /// refetched booking — never from the simulated outcome itself.
  Future<void> _startPayment() async {
    final booking = _booking;
    if (booking == null || _paying || !mounted) return;
    setState(() => _paying = true);
    try {
      final intent = await widget.payments.initiate(booking.id);
      if (!mounted) return;
      final outcome = await showDialog<String?>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => _DemoPaymentSheet(intent: intent),
      );
      if (!mounted) return;
      if (outcome == null) {
        // Cancelled simulation: the pending intent stays; just refresh.
        await _load();
        return;
      }
      try {
        await widget.payments.sendDemoEvent(
          paymentId: intent.payment.id,
          eventId: const Uuid().v4(),
          outcome: outcome,
          amount: intent.payment.amount,
          currency: intent.payment.currency,
          token: intent.callbackToken,
        );
      } on ApiFailure catch (failure) {
        if (!mounted) return;
        if (failure.code == 'PAYMENT_ALREADY_SETTLED') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.lamsa.paymentSettledMessage)),
          );
        } else if (failure.code == 'AMOUNT_MISMATCH') {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(failure.message)));
        }
      } on Object {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.lamsa.paymentUnknownMessage)),
          );
        }
      }
      if (!mounted) return;
      final previousStatus = _booking?.status;
      await _load();
      if (!mounted) return;
      final current = _booking;
      if (current == null) return;
      if (current.status == 'confirmed' && previousStatus != 'confirmed') {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.bookingConfirmedMessage)),
        );
      } else if (current.status == 'accepted' &&
          _attempts.any((item) => item.isPaid)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.lateSuccessMessage)),
        );
      } else if (_attempts.any((item) => item.isFailed)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.paymentFailedMessage)),
        );
      }
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            failure.code == 'PAYMENT_ALREADY_SETTLED'
                ? context.lamsa.paymentSettledMessage
                : failure.kind == ApiFailureKind.conflict
                ? context.lamsa.bookingStateChanged
                : failure.message,
          ),
        ),
      );
      await _load();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.paymentUnknownMessage)),
        );
        await _load();
      }
    } finally {
      if (mounted) setState(() => _paying = false);
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
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.lamsa.bookingCancelled)));
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
    // A refused booking read leaves no actionable state: the old snapshot is
    // gone, so cancel, pay, and complete are unreachable rather than offered
    // against a state the server would not confirm.
    if (_error != null && _booking == null) {
      final failure = _error is ApiFailure ? _error! as ApiFailure : null;
      return Scaffold(
        appBar: AppBar(title: Text(context.lamsa.bookingDetail)),
        body: SafeArea(
          child: LamsaStatusView(
            status: failure?.kind == ApiFailureKind.forbidden
                ? LamsaStatus.forbidden
                : LamsaStatus.error,
            title: context.lamsa.bookingDetail,
            message: switch (failure?.kind) {
              ApiFailureKind.notFound => context.lamsa.bookingNotFound,
              ApiFailureKind.unauthorized => context.lamsa.sessionExpired,
              ApiFailureKind.forbidden => context.lamsa.forbiddenTitle,
              _ => failure?.message ?? context.lamsa.tryAgain,
            },
            onRetry: _load,
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(context.lamsa.bookingDetail)),
      body: SafeArea(
        child: _booking == null
            ? LamsaStatusView(
                status: LamsaStatus.loading,
                title: context.lamsa.bookingDetail,
                message: context.lamsa.loadingBooking,
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
                      '${formatBookingDateTime(_booking!.startsAt, _booking!.timeZone)} – ${formatBookingTime(_booking!.endsAt, _booking!.timeZone)}',
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
                        formatBookingTime(
                          _booking!.expiresAt!,
                          _booking!.timeZone,
                        ),
                      ),
                    if (_booking!.notes != null && _booking!.notes!.isNotEmpty)
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
                        subtitle: Text(
                          formatBookingDateTime(
                            entry.changedAt,
                            _booking!.timeZone,
                          ),
                        ),
                      ),
                    if (_booking!.isPending || _booking!.isAccepted) ...[
                      const SizedBox(height: 12),
                      OutlinedButton(
                        key: const ValueKey('booking-cancel'),
                        onPressed: _cancelling ? null : _cancel,
                        child: Text(context.lamsa.cancelBooking),
                      ),
                    ],
                    const SizedBox(height: 12),
                    _PaymentSection(
                      booking: _booking!,
                      attempts: _attempts,
                      attemptsError: _attemptsError,
                      paying: _paying,
                      onPay: _startPayment,
                      onRefresh: _load,
                    ),
                    if (_booking!.status == 'confirmed') ...[
                      const SizedBox(height: 12),
                      FilledButton(
                        key: const ValueKey('booking-complete'),
                        onPressed: _completing ? null : _complete,
                        child: Text(
                          _completing
                              ? context.lamsa.sending
                              : context.lamsa.completeBooking,
                        ),
                      ),
                    ],
                    if (_booking!.status == 'completed') ...[
                      const SizedBox(height: 12),
                      _ReviewSection(
                        reviews: _reviews,
                        reviewsError: _reviewsError,
                        currentUserId: widget.currentUserId,
                        rating: _rating,
                        submitting: _submittingReview,
                        onRatingChanged: (value) =>
                            setState(() => _rating = value),
                        onCommentChanged: (value) =>
                            setState(() => _comment = value),
                        onSubmit: _submitReview,
                        onRefresh: _load,
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

/// Payment section of a booking detail. Shows attempt history from the
/// server and offers demo payment only for accepted bookings.
class _PaymentSection extends StatelessWidget {
  const _PaymentSection({
    required this.booking,
    required this.attempts,
    required this.attemptsError,
    required this.paying,
    required this.onPay,
    required this.onRefresh,
  });

  final Booking booking;
  final List<BookingPayment> attempts;

  /// Set when the attempts could not be read. A failure is never rendered as
  /// "no attempts": the list is either marked stale or shown as unavailable.
  final Object? attemptsError;
  final bool paying;
  final VoidCallback onPay;
  final VoidCallback onRefresh;

  String _attemptLabel(BuildContext context, BookingPayment attempt) {
    final state = switch (attempt.status) {
      'paid' => context.lamsa.paymentPaid,
      'failed' => context.lamsa.paymentFailed,
      'refunded' => context.lamsa.paymentRefunded,
      _ => context.lamsa.paymentPending,
    };
    return '$state · ${attempt.amount} ${attempt.currency}';
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        context.lamsa.paymentSection,
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: 4),
      if (booking.isPending)
        Text(
          context.lamsa.paymentNotEligible,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      if (attemptsError != null && attempts.isEmpty)
        _StaleDataNotice(
          key: const ValueKey('payment-attempts-unavailable'),
          message: context.lamsa.paymentAttemptsUnavailable,
          onRetry: onRefresh,
        )
      else if (attemptsError != null)
        _StaleDataNotice(
          key: const ValueKey('payment-attempts-stale'),
          message: context.lamsa.paymentAttemptsNotUpdated,
          onRetry: onRefresh,
        ),
      for (final attempt in attempts)
        ListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: Text(_attemptLabel(context, attempt)),
          subtitle: attempt.failureReason != null
              ? Text(attempt.failureReason!)
              : null,
        ),
      if (booking.isAccepted) ...[
        const SizedBox(height: 8),
        FilledButton(
          key: const ValueKey('booking-pay'),
          onPressed: paying ? null : onPay,
          child: Text(
            paying ? context.lamsa.sending : context.lamsa.payNowDemo,
          ),
        ),
      ],
    ],
  );
}

/// Explicitly labeled demo provider sheet. No card fields exist: the user
/// only picks a simulated outcome, and amounts always echo the server intent.
class _DemoPaymentSheet extends StatelessWidget {
  const _DemoPaymentSheet({required this.intent});

  final PaymentIntent intent;

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.lamsa.demoPaymentTitle),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          context.lamsa.demoPaymentNotice,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        Text(
          '${intent.payment.amount} ${intent.payment.currency}',
          style: Theme.of(context).textTheme.headlineSmall,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.center,
        ),
      ],
    ),
    actions: [
      TextButton(
        key: const ValueKey('demo-cancel'),
        onPressed: () => Navigator.of(context).pop(),
        child: Text(context.lamsa.cancel),
      ),
      TextButton(
        key: const ValueKey('demo-fail'),
        onPressed: () => Navigator.of(context).pop('failed'),
        child: Text(context.lamsa.simulateFailure),
      ),
      FilledButton(
        key: const ValueKey('demo-success'),
        onPressed: () => Navigator.of(context).pop('paid'),
        child: Text(context.lamsa.simulateSuccess),
      ),
    ],
  );
}

/// Inline notice for auxiliary data that could not be read. It states plainly
/// that the shown data is not current, instead of leaving an empty section that
/// would read as a confirmed "nothing here".
class _StaleDataNotice extends StatelessWidget {
  const _StaleDataNotice({
    required this.message,
    required this.onRetry,
    super.key,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(message, style: Theme.of(context).textTheme.bodySmall),
        ),
        TextButton(onPressed: onRetry, child: Text(context.lamsa.retry)),
      ],
    ),
  );
}

/// Review section of a completed booking. Shows both parties' reviews when
/// present and offers the form only while the current user has not reviewed.
class _ReviewSection extends StatelessWidget {
  const _ReviewSection({
    required this.reviews,
    required this.reviewsError,
    required this.currentUserId,
    required this.rating,
    required this.submitting,
    required this.onRatingChanged,
    required this.onCommentChanged,
    required this.onSubmit,
    required this.onRefresh,
  });

  final List<BookingReview> reviews;

  /// A failed read is shown, never collapsed into "not reviewed yet": offering
  /// the form there could invite a duplicate submission.
  final Object? reviewsError;
  final String? currentUserId;
  final int rating;
  final bool submitting;
  final ValueChanged<int> onRatingChanged;
  final ValueChanged<String> onCommentChanged;
  final VoidCallback onSubmit;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final mine = reviews
        .where(
          (item) =>
              item.isMine(viewerIsCustomer: true, viewerId: currentUserId),
        )
        .firstOrNull;
    final other = reviews
        .where(
          (item) =>
              !item.isMine(viewerIsCustomer: true, viewerId: currentUserId),
        )
        .firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          context.lamsa.rateExperience,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        if (reviewsError != null)
          _StaleDataNotice(
            key: const ValueKey('reviews-unavailable'),
            message: context.lamsa.reviewsUnavailable,
            onRetry: onRefresh,
          ),
        if (mine != null)
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(
              '${context.lamsa.myReview}: ${'★' * mine.rating.toInt()}${'☆' * (5 - mine.rating.toInt())}',
            ),
            subtitle: mine.comment != null && mine.comment!.isNotEmpty
                ? Text(mine.comment!)
                : null,
          ),
        if (other != null)
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(
              '${context.lamsa.otherPartyReview}: ${'★' * other.rating.toInt()}${'☆' * (5 - other.rating.toInt())}',
            ),
            subtitle: other.comment != null && other.comment!.isNotEmpty
                ? Text(other.comment!)
                : null,
          ),
        if (mine == null && reviewsError == null) ...[
          const SizedBox(height: 8),
          Text(context.lamsa.ratingStars),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var star = 1; star <= 5; star++)
                IconButton(
                  key: ValueKey('review-star-$star'),
                  tooltip: '$star',
                  onPressed: submitting ? null : () => onRatingChanged(star),
                  icon: Icon(
                    star <= rating ? Icons.star : Icons.star_border,
                    color: star <= rating ? LamsaColors.berry : null,
                  ),
                ),
            ],
          ),
          TextField(
            key: const ValueKey('review-comment'),
            decoration: InputDecoration(
              labelText: context.lamsa.commentOptional,
            ),
            maxLength: 1000,
            maxLines: 3,
            onChanged: onCommentChanged,
          ),
          const SizedBox(height: 8),
          FilledButton(
            key: const ValueKey('review-submit'),
            onPressed: submitting ? null : onSubmit,
            child: Text(
              submitting ? context.lamsa.sending : context.lamsa.submitReview,
            ),
          ),
        ],
      ],
    );
  }
}
