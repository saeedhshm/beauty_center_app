import 'package:flutter/widgets.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';

/// Shared paging and race discipline for the notifications centre.
///
/// Both apps render the same server-paginated, unread-filtered feed, so the
/// state machine lives here instead of being copied into each screen.
///
/// Guarantees:
/// - a reload (pull-to-refresh, lifecycle resume, filter change) always starts
///   at page one and clears the accumulated pages;
/// - a load-more appends server pages without duplicating items;
/// - every reply may only write state when its generation and filter are still
///   current, so a slow older reply never overwrites newer data. HTTP
///   cancellation is not used as the guarantee;
/// - load-more is single-flight: a repeated or concurrent tap is ignored while
///   one is already running;
/// - a failed page keeps the items already loaded and reports the failure
///   separately instead of emptying the list.
mixin NotificationFeedController<T extends StatefulWidget> on State<T> {
  NotificationGateway get notificationsGateway;

  List<AppNotification> feedItems = const [];
  int feedUnread = 0;
  bool feedUnreadOnly = false;
  int feedPage = 0;
  bool feedHasNext = false;
  bool feedLoading = true;
  bool feedLoadingMore = false;
  Object? feedError;
  Object? feedPageError;

  int _feedGeneration = 0;

  /// Returns to page one and refetches. Use for pull-to-refresh, lifecycle
  /// resume, and any filter change.
  Future<void> feedReload() => _feedLoad(reset: true);

  /// Applies a new filter value and reloads from page one.
  Future<void> feedSetUnreadOnly(bool value) async {
    if (value == feedUnreadOnly) return;
    feedUnreadOnly = value;
    await feedReload();
  }

  Future<void> _feedLoad({required bool reset}) async {
    final generation = reset ? ++_feedGeneration : _feedGeneration;
    final unreadOnly = feedUnreadOnly;
    final page = reset ? 1 : feedPage;
    if (!mounted) return;
    setState(() {
      if (reset) {
        feedPage = 1;
        feedItems = const [];
        feedLoadingMore = false;
        feedPageError = null;
      }
      feedLoading = reset || feedItems.isEmpty;
      feedError = null;
    });
    try {
      final results = await Future.wait([
        notificationsGateway.notifications(unreadOnly: unreadOnly, page: page),
        notificationsGateway.unreadCount(),
      ]);
      if (!_isCurrentFeedRequest(generation, unreadOnly)) return;
      final fetched = results[0] as CatalogPage<AppNotification>;
      setState(() {
        feedItems = reset ? fetched.items : [...feedItems, ...fetched.items];
        feedPage = fetched.page;
        feedHasNext = fetched.hasNext;
        feedUnread = results[1] as int;
        feedLoading = false;
      });
    } catch (error) {
      if (!_isCurrentFeedRequest(generation, unreadOnly)) return;
      setState(() {
        feedError = error;
        feedLoading = false;
      });
    }
  }

  /// Appends the next server page. Ignored while another load-more runs, when
  /// there is no next page, or while the first page is still loading.
  Future<void> feedLoadMore() async {
    final generation = _feedGeneration;
    final unreadOnly = feedUnreadOnly;
    final page = feedPage;
    if (feedLoadingMore || feedLoading || !feedHasNext || feedError != null) {
      return;
    }
    setState(() {
      feedLoadingMore = true;
      feedPageError = null;
    });
    try {
      final fetched = await notificationsGateway.notifications(
        unreadOnly: unreadOnly,
        page: page + 1,
      );
      if (!_isCurrentFeedRequest(generation, unreadOnly) || feedPage != page) {
        return;
      }
      setState(() {
        feedItems = [...feedItems, ...fetched.items];
        feedPage = fetched.page;
        feedHasNext = fetched.hasNext;
      });
    } catch (error) {
      if (!_isCurrentFeedRequest(generation, unreadOnly) || feedPage != page) {
        return;
      }
      setState(() => feedPageError = error);
    } finally {
      if (_isCurrentFeedRequest(generation, unreadOnly) && feedPage == page) {
        if (mounted) setState(() => feedLoadingMore = false);
      }
    }
  }

  /// Retries only the failed page, keeping every item already loaded.
  Future<void> feedRetryPage() => feedLoadMore();

  bool _isCurrentFeedRequest(int generation, bool unreadOnly) =>
      mounted && generation == _feedGeneration && unreadOnly == feedUnreadOnly;
}
