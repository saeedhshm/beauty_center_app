import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

enum _SectionKind { pending, accepted, confirmed }

/// Independent server-side paging state per section. Pages never mix:
/// each section tracks its own page, hasNext, loading flags, error, and a
/// generation counter that discards stale responses after a refresh or a
/// concurrent state transition.
class _SectionData {
  _SectionData(this.status);

  final String status;
  List<Booking> items = [];
  int page = 0;
  bool hasNext = false;
  bool loading = false;
  bool loadingMore = false;
  Object? error;
  int generation = 0;
}

/// Expert requests (A5+): owned pending bookings with accept/reject, plus
/// read-only accepted and confirmed sections. Every section pages
/// independently from the server; transitions reload only affected sections.
class ExpertRequestsScreen extends StatefulWidget {
  const ExpertRequestsScreen({
    required this.bookings,
    required this.reviews,
    this.currentUserId,
    this.refreshSignal,
    super.key,
  });

  final BookingGateway bookings;
  final ReviewGateway reviews;
  final String? currentUserId;
  final Listenable? refreshSignal;

  @override
  State<ExpertRequestsScreen> createState() => _ExpertRequestsScreenState();
}

class _ExpertRequestsScreenState extends State<ExpertRequestsScreen>
    with WidgetsBindingObserver {
  final Map<_SectionKind, _SectionData> _sections = {
    _SectionKind.pending: _SectionData(BookingStates.pending),
    _SectionKind.accepted: _SectionData(BookingStates.accepted),
    _SectionKind.confirmed: _SectionData(BookingStates.confirmed),
  };
  bool _firstLoad = true;
  String? _mutatingId;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_load);
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didUpdateWidget(covariant ExpertRequestsScreen oldWidget) {
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

  /// Resets every section to page one and refetches. Late responses from a
  /// previous generation are ignored per section.
  Future<void> _load() async {
    if (!mounted) return;
    for (final section in _sections.values) {
      section.generation++;
      section.page = 0;
      section.error = null;
      section.loading = true;
      section.loadingMore = false;
    }
    setState(() {});
    await Future.wait([
      for (final kind in _sections.keys) _fetchPage(kind, 1, reset: true),
    ]);
    if (mounted) setState(() => _firstLoad = false);
  }

  /// Resets only the affected sections (e.g. pending + accepted after an
  /// accept that moves a booking across sections).
  Future<void> _reloadSections(Set<_SectionKind> kinds) async {
    if (!mounted) return;
    for (final kind in kinds) {
      final section = _sections[kind]!;
      section.generation++;
      section.page = 0;
      section.items = [];
      section.error = null;
      section.loading = true;
      section.loadingMore = false;
    }
    setState(() {});
    await Future.wait([
      for (final kind in kinds) _fetchPage(kind, 1, reset: true),
    ]);
  }

  Future<void> _fetchPage(
    _SectionKind kind,
    int page, {
    required bool reset,
  }) async {
    final section = _sections[kind]!;
    final generation = section.generation;
    try {
      final result = await widget.bookings.bookings(
        status: section.status,
        page: page,
      );
      if (!mounted || section.generation != generation) return;
      final items = result.items
          .where((item) => item.status == section.status)
          .toList(growable: false);
      setState(() {
        section.items = reset ? items : [...section.items, ...items];
        section.page = result.page;
        section.hasNext = result.hasNext;
        section.loading = false;
        section.loadingMore = false;
        section.error = null;
      });
    } catch (error) {
      if (!mounted || section.generation != generation) return;
      setState(() {
        section.loading = false;
        section.loadingMore = false;
        section.error = error;
      });
    }
  }

  /// Guarded: no duplicate or overlapping load-more, and never while the
  /// section is still on its first page fetch.
  Future<void> _loadMore(_SectionKind kind) async {
    final section = _sections[kind]!;
    if (section.loadingMore || !section.hasNext || section.loading) return;
    setState(() => section.loadingMore = true);
    await _fetchPage(kind, section.page + 1, reset: false);
  }

  Future<void> _accept(Booking booking) async {
    if (_mutatingId != null) return;
    setState(() => _mutatingId = booking.id);
    try {
      await widget.bookings.accept(booking.id);
      if (!mounted) return;
      setState(() => _mutatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.lamsa.bookingAccepted)),
      );
      await _reloadSections({_SectionKind.pending, _SectionKind.accepted});
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _mutatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_conflictMessage(failure))),
      );
      await _reloadSections({_SectionKind.pending, _SectionKind.accepted});
    } on Object {
      if (mounted) setState(() => _mutatingId = null);
    }
  }

  Future<void> _reject(Booking booking) async {
    if (_mutatingId != null) return;
    final reason = await showDialog<Object?>(
      context: context,
      builder: (dialogContext) => const _RejectDialog(),
    );
    if (reason == null || !mounted) return;
    final reasonText = (reason as String).isEmpty ? null : reason;
    setState(() => _mutatingId = booking.id);
    try {
      await widget.bookings.reject(booking.id, reason: reasonText);
      if (!mounted) return;
      setState(() => _mutatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.lamsa.bookingRejected)),
      );
      await _reloadSections({_SectionKind.pending});
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _mutatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_conflictMessage(failure))),
      );
      await _reloadSections({_SectionKind.pending});
    } on Object {
      if (mounted) setState(() => _mutatingId = null);
    }
  }

  String _conflictMessage(ApiFailure failure) {
    if (!mounted) return failure.message;
    return switch (failure.code) {
      'BOOKING_EXPIRED' => context.lamsa.requestExpired,
      'SLOT_TAKEN' || 'EXPERT_UNAVAILABLE' || 'SLOT_UNAVAILABLE' =>
        context.lamsa.slotLost,
      'INVALID_TRANSITION' => context.lamsa.bookingStateChanged,
      _ => failure.message,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_firstLoad) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.bookingRequests,
        message: context.lamsa.loadingRequests,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          _pendingSection(),
          const SizedBox(height: 16),
          Text(
            context.lamsa.acceptedAwaitingPayment,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          _itemsSection(_SectionKind.accepted),
          const SizedBox(height: 16),
          Text(
            context.lamsa.confirmedInProgress,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          _itemsSection(_SectionKind.confirmed),
        ],
      ),
    );
  }

  Widget _pendingSection() {
    final section = _sections[_SectionKind.pending]!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (section.error != null)
          _sectionError(_SectionKind.pending)
        else ...[
          if (section.items.isEmpty && !section.loading)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.bookingRequests,
              message: context.lamsa.noPendingRequests,
              onRetry: () =>
                  _reloadSections({_SectionKind.pending}),
            ),
          for (final booking in section.items)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${booking.totalAmount} ${booking.currency}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatBookingDateTime(
                        booking.startsAt,
                        booking.timeZone,
                      ),
                      textDirection: TextDirection.ltr,
                      textAlign: TextAlign.right,
                    ),
                    if (booking.notes != null &&
                        booking.notes!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(booking.notes!),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            key: ValueKey('request-accept-${booking.id}'),
                            onPressed: _mutatingId != null
                                ? null
                                : () => _accept(booking),
                            child: Text(context.lamsa.acceptBooking),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            key: ValueKey('request-reject-${booking.id}'),
                            onPressed: _mutatingId != null
                                ? null
                                : () => _reject(booking),
                            child: Text(context.lamsa.rejectBooking),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          _loadMoreRow(_SectionKind.pending),
        ],
      ],
    );
  }

  Widget _itemsSection(_SectionKind kind) {
    final section = _sections[kind]!;
    final name = kind.name;
    final emptyText = kind == _SectionKind.accepted
        ? context.lamsa.noAcceptedAwaitingPayment
        : context.lamsa.noConfirmedBookings;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (section.error != null)
          _sectionError(kind)
        else ...[
          if (section.items.isEmpty && !section.loading)
            Text(
              emptyText,
              key: ValueKey('empty-$name'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          for (final booking in section.items)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                key: ValueKey('$name-${booking.id}'),
                title: Text(
                  '${booking.totalAmount} ${booking.currency}',
                ),
                subtitle: Text(
                  formatBookingDateTime(
                    booking.startsAt,
                    booking.timeZone,
                  ),
                  textDirection: TextDirection.ltr,
                ),
                trailing: kind == _SectionKind.confirmed
                    ? const Icon(Icons.chevron_left)
                    : null,
                onTap: kind == _SectionKind.confirmed
                    ? () async {
                        await showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          builder: (sheetContext) => _ConfirmedSheet(
                            bookings: widget.bookings,
                            reviews: widget.reviews,
                            currentUserId: widget.currentUserId,
                            booking: booking,
                          ),
                        );
                        if (mounted) {
                          await _reloadSections({_SectionKind.confirmed});
                        }
                      }
                    : null,
              ),
            ),
          _loadMoreRow(kind),
        ],
      ],
    );
  }

  Widget _sectionError(_SectionKind kind) {
    final section = _sections[kind]!;
    final error = section.error!;
    final message = error is ApiFailure ? error.message : context.lamsa.tryAgain;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              message,
              key: ValueKey('error-${kind.name}'),
            ),
            const SizedBox(height: 8),
            TextButton(
              key: ValueKey('retry-${kind.name}'),
              onPressed: () => _reloadSections({kind}),
              child: Text(context.lamsa.retry),
            ),
          ],
        ),
      ),
    );
  }

  Widget _loadMoreRow(_SectionKind kind) {
    final section = _sections[kind]!;
    if (!section.hasNext) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: OutlinedButton(
        key: ValueKey('load-more-${kind.name}'),
        onPressed:
            section.loadingMore ? null : () => _loadMore(kind),
        child: section.loadingMore
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(context.lamsa.loadMore),
      ),
    );
  }
}

class _RejectDialog extends StatefulWidget {
  const _RejectDialog();

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.lamsa.rejectBooking),
    content: TextField(
      key: const ValueKey('reject-reason'),
      controller: _controller,
      maxLength: 500,
      decoration: InputDecoration(
        labelText: context.lamsa.rejectReasonOptional,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: Text(context.lamsa.cancel),
      ),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
        child: Text(context.lamsa.rejectBooking),
      ),
    ],
  );
}

/// Execution detail of a confirmed booking (A7): party-disclosed address,
/// the approved completion transition, and customer review afterwards.
/// Completion and review both refetch; nothing is claimed locally.
class _ConfirmedSheet extends StatefulWidget {
  const _ConfirmedSheet({
    required this.bookings,
    required this.reviews,
    required this.booking,
    this.currentUserId,
  });

  final BookingGateway bookings;
  final ReviewGateway reviews;
  final Booking booking;
  final String? currentUserId;

  @override
  State<_ConfirmedSheet> createState() => _ConfirmedSheetState();
}

class _ConfirmedSheetState extends State<_ConfirmedSheet> {
  late Booking _booking = widget.booking;
  List<BookingReview> _reviews = const [];
  bool _completing = false;
  int _rating = 5;
  String _comment = '';
  bool _submitting = false;
  bool _loadingReviews = true;

  @override
  void initState() {
    super.initState();
    _loadReviews();
  }

  Future<void> _loadReviews() async {
    try {
      final reviews = await widget.reviews.forBooking(_booking.id);
      if (mounted) {
        setState(() {
          _reviews = reviews;
          _loadingReviews = false;
        });
      }
    } on Object {
      if (mounted) setState(() => _loadingReviews = false);
    }
  }

  Future<void> _complete() async {
    if (_completing) return;
    setState(() => _completing = true);
    try {
      final updated = await widget.bookings.complete(_booking.id);
      if (!mounted) return;
      setState(() {
        _booking = updated;
        _completing = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.bookingCompleted)),
        );
      }
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
    } on Object {
      if (mounted) setState(() => _completing = false);
    }
  }

  Future<void> _submitReview() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      await widget.reviews.submit(
        _booking.id,
        rating: _rating,
        comment: _comment.isEmpty ? null : _comment,
      );
      if (!mounted) return;
      setState(() => _submitting = false);
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(content: Text(context.lamsa.reviewSubmitted)),
      );
      await _loadReviews();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _submitting = false);
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
      await _loadReviews();
    } on Object {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final completed = _booking.status == BookingStates.completed;
    final mine = _reviews
        .where(
          (item) => item.isMine(
            viewerIsCustomer: false,
            viewerId: widget.currentUserId,
          ),
        )
        .firstOrNull;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${_booking.totalAmount} ${_booking.currency}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                formatBookingDateTime(
                  _booking.startsAt,
                  _booking.timeZone,
                ),
                textDirection: TextDirection.ltr,
                textAlign: TextAlign.right,
              ),
              const SizedBox(height: 8),
              Text(
                '${context.lamsa.customerAddress}: ${_booking.addressText}',
              ),
              if (_booking.notes != null && _booking.notes!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(_booking.notes!),
              ],
              if (!completed) ...[
                const SizedBox(height: 12),
                FilledButton(
                  key: const ValueKey('confirmed-complete'),
                  onPressed: _completing ? null : _complete,
                  child: Text(
                    _completing
                        ? context.lamsa.sending
                        : context.lamsa.completeBooking,
                  ),
                ),
              ] else ...[
                const SizedBox(height: 12),
                Text(
                  context.lamsa.rateExperience,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (_loadingReviews)
                  const Center(child: CircularProgressIndicator())
                else ...[
                  for (final review in _reviews)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: Text(
                        review.isMine(
                          viewerIsCustomer: false,
                          viewerId: widget.currentUserId,
                        )
                            ? '${context.lamsa.myReview}: ${'★' * review.rating}'
                            : '${context.lamsa.otherPartyReview}: ${'★' * review.rating}',
                      ),
                      subtitle:
                          review.comment != null && review.comment!.isNotEmpty
                          ? Text(review.comment!)
                          : null,
                    ),
                  if (mine == null) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var star = 1; star <= 5; star++)
                          IconButton(
                            key: ValueKey('expert-review-star-$star'),
                            tooltip: '$star',
                            onPressed: _submitting
                                ? null
                                : () => setState(() => _rating = star),
                            icon: Icon(
                              star <= _rating
                                  ? Icons.star
                                  : Icons.star_border,
                            ),
                          ),
                      ],
                    ),
                    TextField(
                      key: const ValueKey('expert-review-comment'),
                      decoration: InputDecoration(
                        labelText: context.lamsa.commentOptional,
                      ),
                      maxLength: 1000,
                      maxLines: 2,
                      onChanged: (value) => _comment = value,
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      key: const ValueKey('expert-review-submit'),
                      onPressed: _submitting ? null : _submitReview,
                      child: Text(
                        _submitting
                            ? context.lamsa.sending
                            : context.lamsa.submitReview,
                      ),
                    ),
                  ],
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}
