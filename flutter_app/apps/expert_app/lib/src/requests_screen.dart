import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Expert pending requests (A5): accept/reject owned pending bookings only.
/// Every transition refetches; 409 reloads the current state explicitly.
class ExpertRequestsScreen extends StatefulWidget {
  const ExpertRequestsScreen({
    required this.bookings,
    this.refreshSignal,
    super.key,
  });

  final BookingGateway bookings;
  final Listenable? refreshSignal;

  @override
  State<ExpertRequestsScreen> createState() => _ExpertRequestsScreenState();
}

class _ExpertRequestsScreenState extends State<ExpertRequestsScreen>
    with WidgetsBindingObserver {
  List<Booking> _items = const [];
  List<Booking> _accepted = const [];
  bool _loading = true;
  Object? _error;
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

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _error = null);
    try {
      final results = await Future.wait([
        widget.bookings.bookings(status: 'pending'),
        widget.bookings.bookings(status: 'accepted'),
      ]);
      if (!mounted) return;
      setState(() {
        // Ownership is enforced server-side; keep only visible states.
        _items = results[0].items
            .where((item) => item.status == BookingStates.pending)
            .toList(growable: false);
        // A6: accepted bookings awaiting customer payment, read-only here.
        // Confirmation appears only after the server confirms it.
        _accepted = results[1].items
            .where((item) => item.status == BookingStates.accepted)
            .toList(growable: false);
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
      await _load();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _mutatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_conflictMessage(failure))),
      );
      await _load();
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
      await _load();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _mutatingId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_conflictMessage(failure))),
      );
      await _load();
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
    if (_loading && _error == null && _items.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.bookingRequests,
        message: context.lamsa.loadingRequests,
      );
    }
    if (_error != null && _items.isEmpty) {
      final failure = _error is ApiFailure ? _error! as ApiFailure : null;
      return LamsaStatusView(
        status: failure?.kind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.bookingRequests,
        message: failure?.message ?? context.lamsa.tryAgain,
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          if (_items.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.bookingRequests,
              message: context.lamsa.noPendingRequests,
              onRetry: _load,
            ),
          for (final booking in _items)
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
                      booking.startsAt,
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
          const SizedBox(height: 16),
          Text(
            context.lamsa.acceptedAwaitingPayment,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (_accepted.isEmpty)
            Text(
              context.lamsa.noAcceptedAwaitingPayment,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          for (final booking in _accepted)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                key: ValueKey('accepted-${booking.id}'),
                title: Text(
                  '${booking.totalAmount} ${booking.currency}',
                ),
                subtitle: Text(
                  booking.startsAt,
                  textDirection: TextDirection.ltr,
                ),
              ),
            ),
        ],
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
