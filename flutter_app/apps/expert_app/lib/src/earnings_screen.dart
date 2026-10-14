import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Expert earnings, read-only (A9). Every figure comes from the server as a
/// decimal string; the screen never sums, converts, or edits financial
/// history, and it never starts a bank transfer.
class ExpertEarningsScreen extends StatefulWidget {
  const ExpertEarningsScreen({
    required this.earnings,
    this.refreshSignal,
    super.key,
  });

  final EarningGateway earnings;
  final Listenable? refreshSignal;

  @override
  State<ExpertEarningsScreen> createState() => _ExpertEarningsScreenState();
}

class _ExpertEarningsScreenState extends State<ExpertEarningsScreen>
    with WidgetsBindingObserver {
  EarningsSummary? _summary;
  List<ExpertPayout> _items = const [];
  bool? _transferredFilter;
  int _page = 1;
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
  void didUpdateWidget(covariant ExpertEarningsScreen oldWidget) {
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
    final transferred = _transferredFilter;
    final page = reset ? 1 : _page;
    if (!mounted) return;
    setState(() {
      if (reset) {
        _page = 1;
        _items = const [];
        _loadingMore = false;
      }
      _loading = reset || (_summary == null && _items.isEmpty);
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.earnings.earnings(),
        widget.earnings.payouts(
          transferred: transferred,
          page: page,
        ),
      ]);
      if (!_isCurrentEarningsRequest(generation, transferred)) return;
      final fetched = results[1] as CatalogPage<ExpertPayout>;
      setState(() {
        _summary = results[0] as EarningsSummary;
        _items = reset ? fetched.items : [..._items, ...fetched.items];
        _page = fetched.page;
        _hasNext = fetched.hasNext;
        _loading = false;
      });
    } catch (error) {
      if (_isCurrentEarningsRequest(generation, transferred)) {
        setState(() {
          _error = error;
          _loading = false;
        });
      }
    } finally {
      if (_isCurrentEarningsRequest(generation, transferred)) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final generation = _requestGeneration;
    final transferred = _transferredFilter;
    final page = _page;
    if (_loadingMore || !_hasNext) return;
    setState(() {
      _loadingMore = true;
      _error = null;
    });
    try {
      final fetched = await widget.earnings.payouts(
        transferred: transferred,
        page: page + 1,
      );
      if (!_isCurrentEarningsRequest(generation, transferred) ||
          _page != page) {
        return;
      }
      setState(() {
        _items = [..._items, ...fetched.items];
        _page = fetched.page;
        _hasNext = fetched.hasNext;
      });
    } catch (error) {
      if (_isCurrentEarningsRequest(generation, transferred) &&
          _page == page) {
        setState(() => _error = error);
      }
    } finally {
      if (_isCurrentEarningsRequest(generation, transferred) &&
          _page == page) {
        setState(() => _loadingMore = false);
      }
    }
  }

  bool _isCurrentEarningsRequest(int generation, bool? transferred) =>
      mounted &&
      generation == _requestGeneration &&
      transferred == _transferredFilter;

  @override
  Widget build(BuildContext context) {
    if (_loading && _error == null && _summary == null) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.earnings,
        message: context.lamsa.loadingEarnings,
      );
    }
    if (_error != null && _summary == null) {
      final failure = _error is ApiFailure ? _error! as ApiFailure : null;
      return LamsaStatusView(
        status: failure?.kind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.earnings,
        message: failure?.message ?? context.lamsa.tryAgain,
        onRetry: _reload,
      );
    }
    final summary = _summary!;
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          _TotalsCard(
            title: context.lamsa.eligibleAmount,
            totals: summary.eligible,
          ),
          const SizedBox(height: 8),
          _TotalsCard(
            title: context.lamsa.recordedAmount,
            totals: summary.recorded,
          ),
          const SizedBox(height: 8),
          _TotalsCard(
            title: context.lamsa.transferredAmount,
            totals: summary.transferred,
          ),
          const SizedBox(height: 16),
          Text(
            context.lamsa.transfers,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            context.lamsa.manualTransferNote,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  key: const ValueKey('transfers-filter-all'),
                  label: Text(context.lamsa.allTransfers),
                  selected: _transferredFilter == null,
                  onSelected: (_) {
                    setState(() => _transferredFilter = null);
                    _reload();
                  },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  key: const ValueKey('transfers-filter-recorded'),
                  label: Text(context.lamsa.transferRecorded),
                  selected: _transferredFilter == false,
                  onSelected: (_) {
                    setState(() => _transferredFilter = false);
                    _reload();
                  },
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  key: const ValueKey('transfers-filter-transferred'),
                  label: Text(context.lamsa.transferDone),
                  selected: _transferredFilter == true,
                  onSelected: (_) {
                    setState(() => _transferredFilter = true);
                    _reload();
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (_items.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.transfers,
              message: context.lamsa.noTransfers,
              onRetry: _reload,
            ),
          for (final payout in _items)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                key: ValueKey('payout-${payout.id}'),
                title: Text('${payout.amount} ${payout.currency}'),
                subtitle: Text(
                  payout.isTransferred
                      ? '${context.lamsa.transferDone} · ${payout.transferRef ?? ''}'
                      : context.lamsa.transferRecorded,
                ),
                trailing: const Icon(Icons.chevron_left),
                onTap: () async {
                  await showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    builder: (sheetContext) => _PayoutSheet(
                      earnings: widget.earnings,
                      payoutId: payout.id,
                    ),
                  );
                  if (mounted) _reload();
                },
              ),
            ),
          if (_hasNext)
            LamsaButton(
              key: const Key('payouts-load-more'),
              label: context.lamsa.loadMore,
              loading: _loadingMore,
              onPressed: _loadingMore ? null : _loadMore,
            ),
        ],
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.title, required this.totals});

  final String title;
  final List<MoneyTotal> totals;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          if (totals.isEmpty)
            Text(
              '0',
              style: Theme.of(context).textTheme.headlineSmall,
              textDirection: TextDirection.ltr,
            ),
          for (final total in totals)
            Text(
              '${total.amount} ${total.currency}',
              key: ValueKey('total-$title-${total.currency}'),
              style: Theme.of(context).textTheme.headlineSmall,
              textDirection: TextDirection.ltr,
            ),
        ],
      ),
    ),
  );
}

class _PayoutSheet extends StatefulWidget {
  const _PayoutSheet({required this.earnings, required this.payoutId});

  final EarningGateway earnings;
  final String payoutId;

  @override
  State<_PayoutSheet> createState() => _PayoutSheetState();
}

class _PayoutSheetState extends State<_PayoutSheet> {
  ExpertPayout? _payout;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final payout = await widget.earnings.payout(widget.payoutId);
      if (mounted) setState(() => _payout = payout);
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_payout == null && _error == null)
              const Center(child: CircularProgressIndicator())
            else if (_payout == null)
              LamsaStatusView(
                status: LamsaStatus.error,
                title: context.lamsa.transfers,
                message: _error is ApiFailure
                    ? (_error! as ApiFailure).message
                    : context.lamsa.tryAgain,
                onRetry: _load,
              )
            else ...[
              Text(
                '${_payout!.amount} ${_payout!.currency}',
                style: Theme.of(context).textTheme.headlineSmall,
                textDirection: TextDirection.ltr,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                _payout!.isTransferred
                    ? '${context.lamsa.transferDone} · ${context.lamsa.transferRef}: ${_payout!.transferRef ?? '—'}'
                    : context.lamsa.transferRecorded,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                context.lamsa.linkedBookings,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              for (final booking in _payout!.bookings)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: Text(
                    '${booking.expertEarning} ${booking.currency}',
                    textDirection: TextDirection.ltr,
                    textAlign: TextAlign.right,
                  ),
                  subtitle: Text(
                    formatBookingDateTime(
                      booking.startsAt,
                      booking.timeZone,
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    ),
  );
}
