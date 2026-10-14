import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

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
    with WidgetsBindingObserver {
  List<AppNotification> _items = const [];
  int _unread = 0;
  bool _unreadOnly = false;
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_load);
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didUpdateWidget(covariant ExpertNotificationsScreen oldWidget) {
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
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.notifications.notifications(unreadOnly: _unreadOnly),
        widget.notifications.unreadCount(),
      ]);
      if (!mounted) return;
      final page = results[0] as CatalogPage<AppNotification>;
      setState(() {
        _items = page.items;
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

  Future<void> _markAllRead() async {
    try {
      await widget.notifications.markAllRead();
      if (mounted) _load();
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
        // Auxiliary; navigation still refetches authoritative state.
      }
    }
    if (!mounted) return;
    final bookingId = _validatedBookingId(item.bookingId);
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

  /// Accepts only well-formed `lamsa://booking/<uuid>` references so a
  /// corrupt id never navigates anywhere. Anything else yields null and the
  /// caller shows a safe message instead.
  static String? _validatedBookingId(String? rawId) {
    final id = rawId?.trim();
    if (id == null || id.isEmpty) return null;
    final link = parseBookingLink(
      Uri(scheme: 'lamsa', host: 'booking', pathSegments: [id]),
    );
    return link?.bookingId;
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
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
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
                  _load();
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
              onRetry: _load,
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
        ],
      ),
    );
  }
}
