import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Review section for a completed booking, shared by the confirmed-booking
/// sheet and the standalone booking detail screen.
///
/// Loads `forBooking` on mount, shows the expert's own review when present,
/// and offers the star/comment form only while the expert has not reviewed
/// yet. Never rendered for non-completed bookings (the parent gates on
/// status); submit maps DUPLICATE_REVIEW and conflicts to friendly messages
/// and reloads instead of claiming local success.
class BookingReviewSection extends StatefulWidget {
  const BookingReviewSection({
    required this.reviews,
    required this.bookingId,
    this.currentUserId,
    super.key,
  });

  final ReviewGateway reviews;
  final String bookingId;
  final String? currentUserId;

  @override
  State<BookingReviewSection> createState() => _BookingReviewSectionState();
}

class _BookingReviewSectionState extends State<BookingReviewSection> {
  List<BookingReview> _reviews = const [];
  bool _loading = true;
  int _rating = 5;
  String _comment = '';
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final reviews = await widget.reviews.forBooking(widget.bookingId);
      if (mounted) {
        setState(() {
          _reviews = reviews;
          _loading = false;
        });
      }
    } on Object {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      await widget.reviews.submit(
        widget.bookingId,
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
      await _load();
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
      await _load();
    } on Object {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final mine = _reviews
        .where(
          (item) => item.isMine(
            viewerIsCustomer: false,
            viewerId: widget.currentUserId,
          ),
        )
        .firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          context.lamsa.rateExperience,
          style: Theme.of(context).textTheme.titleMedium,
        ),
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
            subtitle: review.comment != null && review.comment!.isNotEmpty
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
                    star <= _rating ? Icons.star : Icons.star_border,
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
            onPressed: _submitting ? null : _submit,
            child: Text(
              _submitting ? context.lamsa.sending : context.lamsa.submitReview,
            ),
          ),
        ],
      ],
    );
  }
}
