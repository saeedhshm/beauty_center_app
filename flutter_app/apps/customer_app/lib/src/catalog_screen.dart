import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({required this.gateway, super.key});

  final CatalogGateway gateway;

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
                        setState(() => _serviceId = value == -1 ? null : value);
                        _reloadExperts();
                      },
                    ),
                  ),
                ],
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
                            setState(() => _serviceId = service.id);
                            _reloadExperts();
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
      );
      if (!_isCurrentExpertRequest(generation, cityId, serviceId, query)) {
        return;
      }
      setState(() {
        _experts = result.items;
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query)) {
        setState(() => _error = error);
      }
    } finally {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query)) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final generation = _expertRequestGeneration;
    final cityId = _cityId;
    final serviceId = _serviceId;
    final query = _query;
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
      );
      if (!_isCurrentExpertRequest(generation, cityId, serviceId, query) ||
          _page != page) {
        return;
      }
      setState(() {
        _experts = [..._experts, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query) &&
          _page == page) {
        setState(() => _error = error);
      }
    } finally {
      if (_isCurrentExpertRequest(generation, cityId, serviceId, query) &&
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

  bool _isCurrentExpertRequest(
    int generation,
    int? cityId,
    int? serviceId,
    String? query,
  ) =>
      mounted &&
      generation == _expertRequestGeneration &&
      cityId == _cityId &&
      serviceId == _serviceId &&
      query == _query;
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
    required this.expertId,
    super.key,
  });

  final CatalogGateway gateway;
  final String expertId;

  @override
  State<ExpertDetailScreen> createState() => _ExpertDetailScreenState();
}

class _ExpertDetailScreenState extends State<ExpertDetailScreen> {
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

  @override
  void initState() {
    super.initState();
    _load();
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
      setState(() {
        _expert = results[0] as ExpertDetail;
        _portfolio = results[1] as List<PortfolioItem>;
        _reviews = reviews.items;
        _reviewPage = reviews.page;
        _hasMoreReviews = reviews.hasNext;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMoreReviews() async {
    setState(() {
      _loadingReviews = true;
      _reviewError = null;
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
  const _InlineError({required this.error, required this.onRetry});

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
