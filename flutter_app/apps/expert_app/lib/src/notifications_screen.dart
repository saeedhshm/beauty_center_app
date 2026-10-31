import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';
import 'package:lamsa_notifications/lamsa_notifications.dart';

/// Expert notifications center (A8 partial): server list, unread filter,
/// mark-read, and deep-open of the referenced booking through a fresh
/// `GET /bookings/:id` fetch. Nothing is read from the notification payload
/// beyond the validated reference.
class ExpertNotificationsScreen extends StatefulWidget {
  const ExpertNotificationsScreen({
    required this.notifications,
    required this.onOpenBooking,
    this.refreshSignal,
    super.key,
  });

  final NotificationGateway notifications;
  final ValueChanged<String> onOpenBooking;
  final Listenable? refreshSignal;

  @override
  State<ExpertNotificationsScreen> createState() =>
      _ExpertNotificationsScreenState();
}

class _ExpertNotificationsScreenState extends State<ExpertNotificationsScreen>
    with
        WidgetsBindingObserver,
        NotificationFeedController<ExpertNotificationsScreen> {
  @override
  NotificationGateway get notificationsGateway => widget.notifications;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(feedReload);
    WidgetsBinding.instance.addObserver(this);
    feedReload();
  }

  @override
  void didUpdateWidget(covariant ExpertNotificationsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshSignal != widget.refreshSignal) {
      oldWidget.refreshSignal?.removeListener(feedReload);
      widget.refreshSignal?.addListener(feedReload);
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(feedReload);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) feedReload();
  }

  Future<void> _markAllRead() async {
    try {
      await widget.notifications.markAllRead();
      if (mounted) feedReload();
    } on ApiFailure catch (failure) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(failure.message)));
      }
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.lamsa.tryAgain)));
      }
    }
  }

  Future<void> _open(AppNotification item) async {
    if (!item.isRead) {
      try {
        await widget.notifications.markRead(item.id);
      } on Object {
        // Auxiliary; navigation still refetches authoritative state.
      }
    }
    if (!mounted) return;
    final rawBookingId = item.bookingId?.trim();
    final bookingId = rawBookingId != null && isValidBookingId(rawBookingId)
        ? rawBookingId
        : null;
    if (bookingId == null) {
      if (item.bookingId != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.invalidBookingLink)),
        );
      }
      return;
    }
    widget.onOpenBooking(bookingId);
  }

  @override
  Widget build(BuildContext context) {
    if (feedLoading && feedError == null && feedItems.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.notifications,
        message: context.lamsa.loadingNotifications,
      );
    }
    if (feedError != null && feedItems.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.error,
        title: context.lamsa.notifications,
        message: feedError is ApiFailure
            ? (feedError! as ApiFailure).message
            : context.lamsa.tryAgain,
        onRetry: feedReload,
      );
    }
    return RefreshIndicator(
      onRefresh: feedReload,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          Row(
            children: [
              FilterChip(
                key: const ValueKey('notifications-unread-only'),
                label: Text(context.lamsa.unreadOnly),
                selected: feedUnreadOnly,
                onSelected: feedSetUnreadOnly,
              ),
              const SizedBox(width: 8),
              if (feedUnread > 0)
                Expanded(
                  child: Text(
                    context.lamsa.unreadCount(feedUnread),
                    textAlign: TextAlign.end,
                  ),
                ),
              TextButton(
                key: const ValueKey('notifications-read-all'),
                onPressed: _markAllRead,
                child: Text(context.lamsa.markAllRead),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (feedItems.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.notifications,
              message: context.lamsa.noNotifications,
              onRetry: feedReload,
            ),
          for (final item in feedItems)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                key: ValueKey('notification-${item.id}'),
                title: Text(
                  item.title,
                  style: TextStyle(
                    fontWeight: item.isRead
                        ? FontWeight.normal
                        : FontWeight.bold,
                  ),
                ),
                subtitle: Text(item.body),
                trailing: item.bookingId != null
                    ? const Icon(Icons.chevron_left)
                    : null,
                onTap: () => _open(item),
              ),
            ),
          // A failed page keeps everything already loaded and offers a retry.
          if (feedPageError != null)
            Padding(
              key: const ValueKey('notifications-page-error'),
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      context.lamsa.pageLoadFailed,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  TextButton(
                    key: const ValueKey('notifications-page-retry'),
                    onPressed: feedRetryPage,
                    child: Text(context.lamsa.retry),
                  ),
                ],
              ),
            ),
          if (feedHasNext)
            LamsaButton(
              key: const ValueKey('notifications-load-more'),
              label: context.lamsa.loadMore,
              loading: feedLoadingMore,
              onPressed: feedLoadingMore ? null : feedLoadMore,
            ),
        ],
      ),
    );
  }
}
