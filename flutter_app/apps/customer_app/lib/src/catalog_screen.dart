import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

import 'cairo_slot_time.dart';

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({required this.gateway, required this.availability, super.key});

  final CatalogGateway gateway;
  final AvailabilityGateway availability;

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final _search = TextEditingController();
  List<CatalogCity> _cities = const [];
  List<CatalogService> _services = const [];
  List<PublicExpert> _experts = const [];
  int? _cityId;
  int? _serviceId;
  String? _query;
  ExpertSort _sort = ExpertSort.nameAsc;
  int _page = 1;
  bool _hasNext = false;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  int _expertRequestGeneration = 0;

  @override
  void initState() {
    super.initState();
    _loadInitial();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.lamsa.catalog)),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.loadingCatalog,
        message: context.lamsa.loadingCatalogMessage,
      );
    }
    if (_error != null && _experts.isEmpty) {
      return _FailureView(error: _error!, onRetry: _loadInitial);
    }
    if (_cities.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.empty,
        title: context.lamsa.noCities,
        message: context.lamsa.noCitiesMessage,
        onRetry: _loadInitial,
      );
    }
    return RefreshIndicator(
      onRefresh: _reloadExperts,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: _filters()),
          if (_experts.isEmpty)
            SliverToBoxAdapter(
              child: SizedBox(
                height: 260,
                child: LamsaStatusView(
                  status: LamsaStatus.empty,
                  title: context.lamsa.noExperts,
                  message: context.lamsa.noExpertsMessage,
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              sliver: SliverList.separated(
                itemCount: _experts.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, index) => _ExpertCard(
                  expert: _experts[index],
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ExpertDetailScreen(
                        gateway: widget.gateway,
                        availability: widget.availability,
                        expertId: _experts[index].id,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (_error != null && _experts.isNotEmpty)
            SliverToBoxAdapter(
              child: _InlineError(error: _error!, onRetry: _loadMore),
            ),
          if (_hasNext)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                child: LamsaButton(
                  key: const Key('catalog-load-more'),
                  label: context.lamsa.loadMore,
                  loading: _loadingMore,
                  onPressed: _loadingMore ? null : _loadMore,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _filters() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              TextField(
                key: const Key('catalog-search'),
                controller: _search,
                inputFormatters: [LengthLimitingTextInputFormatter(100)],
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _submitSearch(),
                decoration: InputDecoration(
                  labelText: context.lamsa.searchExperts,
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(
                    tooltip: context.lamsa.search,
                    onPressed: _submitSearch,
                    icon: const Icon(Icons.arrow_forward),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      key: const Key('catalog-city'),
                      initialValue: _cityId,
                      decoration: InputDecoration(
                        labelText: context.lamsa.city,
                      ),
                      items: [
                        for (final city in _cities)
                          DropdownMenuItem(
                            value: city.id,
                            child: Text(city.name),
                          ),
                      ],
                      onChanged: (value) {
                        if (value == null || value == _cityId) return;
                        setState(() => _cityId = value);
                        _reloadExperts();
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      key: const Key('catalog-service'),
                      initialValue: _serviceId ?? -1,
                      decoration: InputDecoration(
                        labelText: context.lamsa.service,
                      ),
                      items: [
                        DropdownMenuItem<int>(
                          value: -1,
                          child: Text(context.lamsa.allServices),
                        ),
                        for (final service in _services)
                          DropdownMenuItem<int>(
                            value: service.id,
                            child: Text(service.name),
                          ),
                      ],
                      onChanged: (value) {
                        _selectService(value == -1 ? null : value);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Semantics(
                label: context.lamsa.sortExperts,
                child: DropdownButtonFormField<ExpertSort>(
                  key: const Key('catalog-sort'),
                  initialValue: _sort,
                  decoration: InputDecoration(
                    labelText: context.lamsa.sortExperts,
                    prefixIcon: const Icon(Icons.sort),
                  ),
                  items: [
                    for (final sort in ExpertSort.values)
                      if (!sort.requiresService || _serviceId != null)
                        DropdownMenuItem(
                          value: sort,
                          child: Text(_sortLabel(sort)),
                        ),
                  ],
                  onChanged: (value) {
                    if (value == null || value == _sort) return;
                    setState(() => _sort = value);
                    _reloadExperts();
                  },
                ),
              ),
              if (_services.isNotEmpty) ...[
                const SizedBox(height: 24),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    context.lamsa.services,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                const SizedBox(height: 12),
                for (final service in _services)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: LamsaCard(
                      child: Semantics(
                        button: true,
                        selected: _serviceId == service.id,
                        child: InkWell(
                          key: Key('catalog-service-card-${service.id}'),
                          onTap: () {
                            _selectService(service.id);
                          },
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                _serviceId == service.id
                                    ? Icons.check_circle
                                    : Icons.spa_outlined,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      service.name,
                                      style: Theme.of(
                                        context,
                                      ).textTheme.titleMedium,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      context.lamsa.serviceDuration(
                                        service.durationMin,
                                      ),
                                    ),
                                    if (service.description != null &&
                                        service.description!.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Text(service.description!),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
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

  Future<void> _loadInitial() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.gateway.cities(),
        _loadAllServices(),
      ]);
      final cities = (results[0] as List<CatalogCity>)
          .where((city) => city.isActive)
          .toList(growable: false);
      final services = results[1] as List<CatalogService>;
      if (!mounted) return;
      setState(() {
        _cities = cities;
        _services = services;
        _cityId = cities.isEmpty ? null : cities.first.id;
      });
      if (cities.isNotEmpty) await _reloadExperts();
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<List<CatalogService>> _loadAllServices() async {
    final services = <CatalogService>[];
    var page = 1;
    while (true) {
      final result = await widget.gateway.services(page: page, limit: 50);
      services.addAll(result.items.where((service) => service.isActive));
      if (!result.hasNext) return services;
      page++;
    }
  }

  Future<void> _reloadExperts() async {
    final generation = ++_expertRequestGeneration;
    final cityId = _cityId;
    final serviceId = _serviceId;
    final query = _query;
    final sort = _sort;
    setState(() {
      _experts = const [];
      _page = 1;
      _hasNext = false;
      _loading = true;
      _loadingMore = false;
      _error = null;
    });
    try {
      final result = await widget.gateway.experts(
        cityId: cityId,
        serviceId: serviceId,
        q: query,
        sort: sort,
      );
      if (!_isCurrentExpertRequest(
        generation,
        cityId,
        serviceId,
        query,
        sort,
      )) {
        return;
      }
      setState(() {
        _experts = result.items;
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query, sort)) {
        setState(() => _error = error);
      }
    } finally {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query, sort)) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final generation = _expertRequestGeneration;
    final cityId = _cityId;
    final serviceId = _serviceId;
    final query = _query;
    final sort = _sort;
    final page = _page;
    setState(() {
      _loadingMore = true;
      _error = null;
    });
    try {
      final result = await widget.gateway.experts(
        page: page + 1,
        cityId: cityId,
        serviceId: serviceId,
        q: query,
        sort: sort,
      );
      if (!_isCurrentExpertRequest(
            generation,
            cityId,
            serviceId,
            query,
            sort,
          ) ||
          _page != page) {
        return;
      }
      setState(() {
        _experts = [..._experts, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query, sort) &&
          _page == page) {
        setState(() => _error = error);
      }
    } finally {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query, sort) &&
          _page == page) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _submitSearch() {
    final trimmed = _search.text.trim();
    final value = trimmed.length <= 100 ? trimmed : trimmed.substring(0, 100);
    if (_search.text != value) {
      _search.value = TextEditingValue(
        text: value,
        selection: TextSelection.collapsed(offset: value.length),
      );
    }
    _query = value.isEmpty ? null : value;
    _reloadExperts();
  }

  void _selectService(int? serviceId) {
    if (serviceId == _serviceId) return;
    setState(() {
      _serviceId = serviceId;
      if (serviceId == null && _sort.requiresService) {
        _sort = ExpertSort.nameAsc;
      }
    });
    _reloadExperts();
  }

  String _sortLabel(ExpertSort sort) => switch (sort) {
    ExpertSort.nameAsc => context.lamsa.sortNameAsc,
    ExpertSort.nameDesc => context.lamsa.sortNameDesc,
    ExpertSort.ratingDesc => context.lamsa.sortRatingDesc,
    ExpertSort.priceAsc => context.lamsa.sortPriceAsc,
    ExpertSort.priceDesc => context.lamsa.sortPriceDesc,
  };

  bool _isCurrentExpertRequest(
    int generation,
    int? cityId,
    int? serviceId,
    String? query,
    ExpertSort sort,
  ) =>
      mounted &&
      generation == _expertRequestGeneration &&
      cityId == _cityId &&
      serviceId == _serviceId &&
      query == _query &&
      sort == _sort;
}

class _ExpertCard extends StatelessWidget {
  const _ExpertCard({required this.expert, required this.onTap});

  final PublicExpert expert;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: LamsaCard(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            onTap: onTap,
            leading: const CircleAvatar(child: Icon(Icons.person_outline)),
            title: Text(expert.name),
            subtitle: Text(
              [
                if (expert.cityName != null) expert.cityName!,
                context.lamsa.ratingSummary(
                  expert.ratingAvg,
                  expert.ratingCount,
                ),
              ].join(' · '),
            ),
            trailing: const Icon(Icons.chevron_right),
          ),
        ),
      ),
    );
  }
}

class ExpertDetailScreen extends StatefulWidget {
  const ExpertDetailScreen({
    required this.gateway,
    required this.availability,
    required this.expertId,
    super.key,
  });

  final CatalogGateway gateway;
  final AvailabilityGateway availability;
  final String expertId;

  @override
  State<ExpertDetailScreen> createState() => _ExpertDetailScreenState();
}

class _ExpertDetailScreenState extends State<ExpertDetailScreen>
    with WidgetsBindingObserver {
  ExpertDetail? _expert;
  List<PortfolioItem> _portfolio = const [];
  List<PublicReview> _reviews = const [];
  int _reviewPage = 1;
  bool _hasMoreReviews = false;
  bool _loading = true;
  bool _loadingReviews = false;
  Object? _error;
  Object? _reviewError;
  final Map<String, Future<List<int>>> _portfolioBytes = {};
  int? _slotServiceId;
  String? _slotDate;
  List<ExpertSlot> _slots = const [];
  bool _loadingSlots = false;
  Object? _slotsError;
  int _slotsRequest = 0;

  @override
  void initState() {
    super.initState();
    ensureCairoTime();
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
    if (state == AppLifecycleState.resumed && _expert != null) {
      _loadSlots();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.lamsa.expertProfile)),
      body: SafeArea(
        child: _loading
            ? LamsaStatusView(
                status: LamsaStatus.loading,
                title: context.lamsa.loadingExpert,
                message: context.lamsa.loadingExpertMessage,
              )
            : _error != null
            ? _FailureView(error: _error!, onRetry: _load)
            : _content(),
      ),
    );
  }

  Widget _content() {
    final expert = _expert!;
    return ListView(
      key: const ValueKey('expert-detail-list'),
      padding: const EdgeInsets.all(16),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  expert.name,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  context.lamsa.ratingSummary(
                    expert.ratingAvg,
                    expert.ratingCount,
                  ),
                ),
                if (expert.cityName != null) ...[
                  const SizedBox(height: 8),
                  Text(context.lamsa.cityValue(expert.cityName!)),
                ],
                if (expert.bio != null && expert.bio!.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  Text(
                    context.lamsa.bio,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(expert.bio!),
                ],
                const SizedBox(height: 24),
                Text(
                  context.lamsa.services,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                for (final service in expert.services)
                  if (service.isActive && service.serviceIsActive)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: LamsaCard(
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(service.name),
                          subtitle: Text(
                            context.lamsa.serviceDuration(service.durationMin),
                          ),
                          trailing: Text(
                            '${service.price} ${service.currency}',
                          ),
                        ),
                      ),
                    ),
                const SizedBox(height: 16),
                _SlotsSection(
                  services: _slotServices,
                  serviceId: _slotServiceId,
                  date: _slotDate,
                  slots: _slots,
                  loading: _loadingSlots,
                  error: _slotsError,
                  onServiceChanged: (value) {
                    setState(() => _slotServiceId = value);
                    _loadSlots();
                  },
                  onDateChanged: (value) {
                    setState(() => _slotDate = value);
                    _loadSlots();
                  },
                  onRetry: _loadSlots,
                ),
                const SizedBox(height: 16),
                Text(
                  context.lamsa.portfolio,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                if (_portfolio.isEmpty)
                  Text(context.lamsa.noPortfolio)
                else
                  SizedBox(
                    height: 180,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _portfolio.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, index) => _PortfolioImage(
                        bytes: _portfolioFuture(_portfolio[index]),
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                Text(
                  context.lamsa.reviews,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                if (_reviews.isEmpty)
                  Text(context.lamsa.noReviews)
                else
                  for (final review in _reviews)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: LamsaCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              context.lamsa.reviewHeading(
                                review.reviewerName,
                                review.rating,
                              ),
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            if (review.serviceName != null) ...[
                              const SizedBox(height: 4),
                              Text(review.serviceName!),
                            ],
                            if (review.comment != null &&
                                review.comment!.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text(review.comment!),
                            ],
                          ],
                        ),
                      ),
                    ),
                if (_reviewError != null)
                  _InlineError(error: _reviewError!, onRetry: _loadMoreReviews),
                if (_hasMoreReviews)
                  LamsaButton(
                    key: const Key('reviews-load-more'),
                    label: context.lamsa.loadMoreReviews,
                    loading: _loadingReviews,
                    onPressed: _loadingReviews ? null : _loadMoreReviews,
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.gateway.expert(widget.expertId),
        widget.gateway.portfolio(widget.expertId),
        widget.gateway.reviews(widget.expertId),
      ]);
      final reviews = results[2] as CatalogPage<PublicReview>;
      if (!mounted) return;
      final detail = results[0] as ExpertDetail;
      final activeServices = detail.services
          .where((item) => item.isActive && item.serviceIsActive)
          .toList(growable: false);
      final firstUsable = activeServices.isEmpty ? null : activeServices.first;
      setState(() {
        _expert = detail;
        _portfolio = results[1] as List<PortfolioItem>;
        _reviews = reviews.items;
        _reviewPage = reviews.page;
        _hasMoreReviews = reviews.hasNext;
        if (firstUsable != null) {
          _slotServiceId ??= firstUsable.serviceId;
          _slotDate ??= nextCairoDates(now: DateTime.now()).first;
        }
      });
      _loadSlots();
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<ExpertOffering> get _slotServices =>
      _expert?.services
          .where((item) => item.isActive && item.serviceIsActive)
          .toList(growable: false) ??
      const <ExpertOffering>[];

  /// Slots always come from the server; stale responses are ignored so a
  /// service or day change never shows another query's results.
  Future<void> _loadSlots() async {
    final serviceId = _slotServiceId;
    final date = _slotDate;
    if (serviceId == null || date == null) return;
    final request = ++_slotsRequest;
    setState(() {
      _loadingSlots = true;
      _slotsError = null;
    });
    try {
      final days = await widget.availability.slots(
        expertId: widget.expertId,
        serviceId: serviceId,
        from: date,
        to: date,
      );
      if (!mounted || request != _slotsRequest) return;
      final items = days.isEmpty ? const <ExpertSlot>[] : days.first.slots;
      setState(() {
        _slots = items;
        _loadingSlots = false;
      });
    } catch (error) {
      if (!mounted || request != _slotsRequest) return;
      setState(() {
        _slotsError = error;
        _loadingSlots = false;
      });
    }
  }

  Future<void> _loadMoreReviews() async {
    setState(() {
      _loadingReviews = true;      _reviewError = null;
    });
    try {
      final result = await widget.gateway.reviews(
        widget.expertId,
        page: _reviewPage + 1,
      );
      if (!mounted) return;
      setState(() {
        _reviews = [..._reviews, ...result.items];
        _reviewPage = result.page;
        _hasMoreReviews = result.hasNext;
      });
    } catch (error) {
      if (mounted) setState(() => _reviewError = error);
    } finally {
      if (mounted) setState(() => _loadingReviews = false);
    }
  }

  Future<List<int>> _portfolioFuture(PortfolioItem item) => _portfolioBytes
      .putIfAbsent(item.id, () => widget.gateway.portfolioBytes(item.url));
}

class _PortfolioImage extends StatelessWidget {
  const _PortfolioImage({required this.bytes});

  final Future<List<int>> bytes;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: FutureBuilder<List<int>>(
          future: bytes,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return ColoredBox(
                color: LamsaColors.blush,
                child: Tooltip(
                  message: context.lamsa.imageLoadFailed,
                  child: const Icon(Icons.broken_image_outlined),
                ),
              );
            }
            if (!snapshot.hasData) {
              return const ColoredBox(
                color: LamsaColors.canvas,
                child: Center(child: CircularProgressIndicator()),
              );
            }
            return Image.memory(
              Uint8List.fromList(snapshot.data!),
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => ColoredBox(
                color: LamsaColors.blush,
                child: Center(child: Text(context.lamsa.imageLoadFailed)),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _FailureView extends StatelessWidget {
  const _FailureView({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final forbidden =
        error is ApiFailure &&
        (error as ApiFailure).kind == ApiFailureKind.forbidden;
    return LamsaStatusView(
      status: forbidden ? LamsaStatus.forbidden : LamsaStatus.error,
      title: forbidden
          ? context.lamsa.forbiddenTitle
          : context.lamsa.requestFailed,
      message: error is ApiFailure
          ? (error as ApiFailure).message
          : context.lamsa.unexpectedError,
      onRetry: onRetry,
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.error, required this.onRetry, super.key});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Text(
            error is ApiFailure
                ? (error as ApiFailure).message
                : context.lamsa.unexpectedError,
            style: const TextStyle(color: LamsaColors.danger),
          ),
          TextButton(onPressed: onRetry, child: Text(context.lamsa.retry)),
        ],
      ),
    );
  }
}

/// Server-provided appointment slots for one expert and service (A4).
///
/// Day and service changes refetch from the backend; nothing is computed
/// locally and no booking or hold is created here.
class _SlotsSection extends StatelessWidget {
  const _SlotsSection({
    required this.services,
    required this.serviceId,
    required this.date,
    required this.slots,
    required this.loading,
    required this.error,
    required this.onServiceChanged,
    required this.onDateChanged,
    required this.onRetry,
  });

  final List<ExpertOffering> services;
  final int? serviceId;
  final String? date;
  final List<ExpertSlot> slots;
  final bool loading;
  final Object? error;
  final ValueChanged<int?> onServiceChanged;
  final ValueChanged<String> onDateChanged;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (services.isEmpty) return const SizedBox.shrink();
    final selected = services.cast<ExpertOffering?>().firstWhere(
      (item) => item?.serviceId == serviceId,
      orElse: () => null,
    );
    final dates = nextCairoDates(now: DateTime.now());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          context.lamsa.appointmentSlots,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          context.lamsa.cairoTimeNote,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          key: const ValueKey('slots-service'),
          initialValue: serviceId,
          decoration: InputDecoration(labelText: context.lamsa.selectService),
          items: [
            for (final service in services)
              DropdownMenuItem(
                value: service.serviceId,
                child: Text(
                  '${service.name} · ${context.lamsa.serviceDuration(service.durationMin)}',
                ),
              ),
          ],
          onChanged: onServiceChanged,
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 64,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: dates.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final day = dates[index];
              final selectedDay = day == date;
              return ChoiceChip(
                key: ValueKey('slots-day-$day'),
                label: Text(
                  '${context.lamsa.weekdayName(cairoWeekdayOf(day))} ${cairoDayLabel(day)}',
                ),
                selected: selectedDay,
                onSelected: (_) => onDateChanged(day),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        if (selected != null)
          Text(
            '${selected.price} ${selected.currency} · ${context.lamsa.serviceDuration(selected.durationMin)}',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        const SizedBox(height: 8),
        if (loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          )
        else if (error != null)
          _InlineError(
            key: const ValueKey('slots-error'),
            error: error!,
            onRetry: onRetry,
          )
        else if (slots.isEmpty)
          LamsaStatusView(
            status: LamsaStatus.empty,
            title: context.lamsa.noSlots,
            message: context.lamsa.noSlotsHint,
            onRetry: onRetry,
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final slot in slots)
                Chip(
                  key: ValueKey('slot-${slot.startsAt}'),
                  label: Text(
                    '${cairoClockOf(slot.startsAt)} – ${cairoClockOf(slot.endsAt)}',
                    textDirection: TextDirection.ltr,
                  ),
                ),
            ],
          ),
      ],
    );
  }
}
