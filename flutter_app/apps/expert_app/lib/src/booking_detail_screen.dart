import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Read-only booking detail for the expert app.
///
/// Fetches `GET /bookings/:id` on open and displays whatever status the
/// server returns (pending through expired), so notifications about bookings
/// that no longer sit in a requests section still open the right resource.
/// Never mutates anything and never trusts notification payload content:
/// only the freshly fetched DTO is shown, including the address exactly as
/// the server discloses it to the owning expert under current policy.
class ExpertBookingDetailScreen extends StatefulWidget {
  const ExpertBookingDetailScreen({
    required this.bookings,
    required this.bookingId,
    super.key,
  });

  final BookingGateway bookings;
  final String bookingId;

  @override
  State<ExpertBookingDetailScreen> createState() =>
      _ExpertBookingDetailScreenState();
}

class _ExpertBookingDetailScreenState extends State<ExpertBookingDetailScreen> {
  Booking? _booking;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
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
            ? _errorView()
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
                      context.lamsa.totalAmount,
                      '${_booking!.totalAmount} ${_booking!.currency}',
                    ),
                    _row(
                      context.lamsa.startTime,
                      formatBookingDateTime(
                        _booking!.startsAt,
                        _booking!.timeZone,
                      ),
                    ),
                    _row(
                      context.lamsa.endTime,
                      formatBookingDateTime(
                        _booking!.endsAt,
                        _booking!.timeZone,
                      ),
                    ),
                    _row(
                      context.lamsa.customerAddress,
                      _booking!.addressText,
                    ),
                    if (_booking!.notes != null &&
                        _booking!.notes!.isNotEmpty)
                      _row(context.lamsa.notes, _booking!.notes!),
                    if (_booking!.cancellationReason != null &&
                        _booking!.cancellationReason!.isNotEmpty)
                      _row(
                        context.lamsa.cancellationReason,
                        _booking!.cancellationReason!,
                      ),
                    const SizedBox(height: 12),
                    Text(
                      context.lamsa.statusHistory,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    for (final entry in _booking!.statusHistory)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
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
                  ],
                ),
              ),
      ),
    );
  }

  Widget _errorView() {
    final failure = _error is ApiFailure ? _error! as ApiFailure : null;
    final status = failure?.kind == ApiFailureKind.forbidden
        ? LamsaStatus.forbidden
        : LamsaStatus.error;
    final message = switch (failure?.kind) {
      ApiFailureKind.notFound => context.lamsa.bookingNotFound,
      ApiFailureKind.unauthorized => context.lamsa.sessionExpired,
      ApiFailureKind.forbidden => context.lamsa.forbiddenTitle,
      _ => failure?.message ?? context.lamsa.tryAgain,
    };
    return LamsaStatusView(
      status: status,
      title: context.lamsa.bookingDetail,
      message: message,
      onRetry: _load,
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          Expanded(flex: 3, child: Text(value)),
        ],
      ),
    );
  }
}
