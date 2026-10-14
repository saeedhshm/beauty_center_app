import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'bookings_screen.dart';

/// Customer notifications center (A8 partial): server list, unread filter,
/// mark-read, and booking deep-open with a fresh server fetch. No push
/// provider is configured, so no token registration happens here.
class CustomerNotificationsScreen extends StatefulWidget {
  const CustomerNotificationsScreen({
    required this.notifications,
    required this.bookings,
    required this.payments,
    required this.reviews,
    this.currentUserId,
    this.refreshSignal,
    super.key,
  });

  final NotificationGateway notifications;
  final BookingGateway bookings;
  final PaymentGateway payments;
  final ReviewGateway reviews;
  final String? currentUserId;
  final Listenable? refreshSignal;

  @override
  State<CustomerNotificationsScreen> createState() =>
      _CustomerNotificationsScreenState();
}

class _CustomerNotificationsScreenState
    extends State<CustomerNotificationsScreen> with WidgetsBindingObserver {
  List<AppNotification> _items = const [];
  int _unread = 0;
  bool _unreadOnly = false;
  int _page = 1;
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
  void didUpdateWidget(covariant CustomerNotificationsScreen oldWidget) {
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
      _loading = reset || _items.isEmpty;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.notifications.notifications(
          unreadOnly: _unreadOnly,
          page: reset ? 1 : _page,
        ),
        widget.notifications.unreadCount(),
      ]);
      if (!mounted) return;
      final page = results[0] as CatalogPage<AppNotification>;
      setState(() {
        _items = reset ? page.items : [..._items, ...page.items];
        _page = page.page;
        _hasNext = page.hasNext;
        _unread = results[1] as int;
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
      final page = await widget.notifications.notifications(
        unreadOnly: _unreadOnly,
        page: _page + 1,
      );
      if (!mounted) return;
      setState(() {
        _items = [..._items, ...page.items];
        _page = page.page;
        _hasNext = page.hasNext;
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

  Future<void> _markAllRead() async {
    try {
      await widget.notifications.markAllRead();
      if (mounted) _reload();
    } on ApiFailure catch (failure) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure.message)),
        );
      }
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.tryAgain)),
        );
      }
    }
  }

  Future<void> _open(AppNotification item) async {
    if (!item.isRead) {
      try {
        await widget.notifications.markRead(item.id);
      } on Object {
        // Read-marking is auxiliary; opening still refetches the booking.
      }
    }
    if (!mounted) return;
    if (item.bookingId == null) {
      _reload();
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BookingDetailScreen(
          bookings: widget.bookings,
          payments: widget.payments,
          reviews: widget.reviews,
          currentUserId: widget.currentUserId,
          bookingId: item.bookingId!,
        ),
      ),
    );
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _error == null && _items.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.notifications,
        message: context.lamsa.loadingNotifications,
      );
    }
    if (_error != null && _items.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.error,
        title: context.lamsa.notifications,
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
          Row(
            children: [
              FilterChip(
                key: const ValueKey('notifications-unread-only'),
                label: Text(context.lamsa.unreadOnly),
                selected: _unreadOnly,
                onSelected: (value) {
                  setState(() => _unreadOnly = value);
                  _reload();
                },
              ),
              const SizedBox(width: 8),
              if (_unread > 0)
                Expanded(
                  child: Text(
                    context.lamsa.unreadCount(_unread),
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
          if (_items.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.notifications,
              message: context.lamsa.noNotifications,
              onRetry: _reload,
            ),
          for (final item in _items)
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
          if (_hasNext)
            LamsaButton(
              key: const Key('notifications-load-more'),
              label: context.lamsa.loadMore,
              loading: _loadingMore,
              onPressed: _loadingMore ? null : _loadMore,
            ),
        ],
      ),
    );
  }
}
