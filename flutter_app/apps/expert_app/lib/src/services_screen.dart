import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

class ExpertServicesScreen extends StatefulWidget {
  const ExpertServicesScreen({
    required this.workspace,
    required this.catalog,
    this.refreshSignal,
    super.key,
  });

  final ExpertWorkspaceGateway workspace;
  final CatalogGateway catalog;
  final Listenable? refreshSignal;

  @override
  State<ExpertServicesScreen> createState() => _ExpertServicesScreenState();
}

class _ExpertServicesScreenState extends State<ExpertServicesScreen> {
  List<ExpertService>? _own;
  List<CatalogService> _global = const [];
  ApiFailureKind? _failureKind;
  String? _error;
  int? _mutatingServiceId;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_load);
    _load();
  }

  @override
  void didUpdateWidget(covariant ExpertServicesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshSignal != widget.refreshSignal) {
      oldWidget.refreshSignal?.removeListener(_load);
      widget.refreshSignal?.addListener(_load);
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_load);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_own == null && _error == null) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.servicesAndPrices,
        message: context.lamsa.loadingServices,
      );
    }
    if (_own == null) {
      return LamsaStatusView(
        status: _failureKind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.servicesLoadFailed,
        message: _error ?? context.lamsa.tryAgain,
        onRetry: _load,
      );
    }

    final ownIds = _own!.map((item) => item.serviceId).toSet();
    final available = _global
        .where((item) => item.isActive && !ownIds.contains(item.id))
        .toList(growable: false);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          Text(
            context.lamsa.servicesAndPrices,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: LamsaSpacing.xs),
          Text(context.lamsa.servicesMoneyHint),
          if (_error != null) ...[
            const SizedBox(height: LamsaSpacing.md),
            Text(_error!, style: const TextStyle(color: LamsaColors.danger)),
          ],
          const SizedBox(height: LamsaSpacing.lg),
          if (_own!.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.noExpertServices,
              message: context.lamsa.addFirstService,
            )
          else
            ..._own!.map(_ownServiceCard),
          const SizedBox(height: LamsaSpacing.xl),
          Text(
            context.lamsa.availableGlobalServices,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: LamsaSpacing.sm),
          if (available.isEmpty)
            Text(context.lamsa.noServicesToAdd)
          else
            ...available.map(_globalServiceCard),
        ],
      ),
    );
  }

  Widget _ownServiceCard(ExpertService service) {
    final global = _global
        .where((item) => item.id == service.serviceId)
        .firstOrNull;
    final globallyActive = service.serviceIsActive ?? global?.isActive ?? false;
    final busy = _mutatingServiceId != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: LamsaSpacing.md),
      child: LamsaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              service.name ?? global?.name ?? context.lamsa.unavailableService,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (service.durationMin ?? global?.durationMin case final duration?)
              Text(context.lamsa.serviceDurationMinutes(duration)),
            const SizedBox(height: LamsaSpacing.sm),
            Text(
              context.lamsa.priceWithCurrency(service.price, service.currency),
            ),
            Text(
              service.isActive
                  ? context.lamsa.offerActive
                  : context.lamsa.offerInactive,
            ),
            Text(
              globallyActive
                  ? context.lamsa.globalServiceActive
                  : context.lamsa.globalServiceInactive,
            ),
            if (!globallyActive)
              Padding(
                padding: const EdgeInsets.only(top: LamsaSpacing.xs),
                child: Text(
                  context.lamsa.globalServiceInactiveHint,
                  style: const TextStyle(color: LamsaColors.warning),
                ),
              ),
            const SizedBox(height: LamsaSpacing.md),
            Wrap(
              spacing: LamsaSpacing.sm,
              runSpacing: LamsaSpacing.sm,
              children: [
                OutlinedButton.icon(
                  onPressed: busy ? null : () => _editPrice(service),
                  icon: const Icon(Icons.edit_outlined),
                  label: Text(context.lamsa.changePrice),
                ),
                FilledButton.tonalIcon(
                  onPressed: busy || (!service.isActive && !globallyActive)
                      ? null
                      : () => _saveService(
                          serviceId: service.serviceId,
                          price: service.price,
                          isActive: !service.isActive,
                        ),
                  icon: _mutatingServiceId == service.serviceId
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          service.isActive
                              ? Icons.pause_circle_outline
                              : Icons.play_circle_outline,
                        ),
                  label: Text(
                    service.isActive
                        ? context.lamsa.deactivateOffer
                        : context.lamsa.activateOffer,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _globalServiceCard(CatalogService service) => Padding(
    padding: const EdgeInsets.only(bottom: LamsaSpacing.sm),
    child: LamsaCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(service.name),
        subtitle: Text(
          context.lamsa.serviceDurationMinutes(service.durationMin),
        ),
        trailing: IconButton.filledTonal(
          tooltip: context.lamsa.addService,
          onPressed: _mutatingServiceId == null
              ? () => _addService(service)
              : null,
          icon: const Icon(Icons.add),
        ),
      ),
    ),
  );

  Future<void> _load() async {
    setState(() {
      _error = null;
      _failureKind = null;
    });
    try {
      final own = await widget.workspace.services();
      final global = <CatalogService>[];
      var pageNumber = 1;
      while (true) {
        final page = await widget.catalog.services(page: pageNumber, limit: 20);
        global.addAll(page.items);
        if (!page.hasNext) {
          break;
        }
        pageNumber += 1;
      }
      if (mounted) {
        setState(() {
          _own = own;
          _global = global;
        });
      }
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _own = null;
          _error = failure.message;
          _failureKind = failure.kind;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _own = null;
          _error = context.lamsa.servicesLoadFailed;
        });
      }
    }
  }

  Future<void> _addService(CatalogService service) async {
    final price = await _requestPrice();
    if (price == null) return;
    await _saveService(serviceId: service.id, price: price, isActive: true);
  }

  Future<void> _editPrice(ExpertService service) async {
    final price = await _requestPrice(initial: service.price);
    if (price == null) return;
    await _saveService(
      serviceId: service.serviceId,
      price: price,
      isActive: service.isActive,
    );
  }

  Future<String?> _requestPrice({String? initial}) async {
    final controller = TextEditingController(text: initial);
    String? fieldError;
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(context.lamsa.servicePrice),
          content: TextField(
            key: const ValueKey('service-price-field'),
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: context.lamsa.priceDecimalLabel,
              errorText: fieldError,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(context.lamsa.cancel),
            ),
            FilledButton(
              onPressed: () {
                final value = controller.text.trim();
                if (!RegExp(r'^\d{1,8}(?:\.\d{1,2})?$').hasMatch(value)) {
                  setDialogState(() => fieldError = context.lamsa.invalidPrice);
                  return;
                }
                Navigator.pop(dialogContext, value);
              },
              child: Text(context.lamsa.save),
            ),
          ],
        ),
      ),
    );
    return result;
  }

  Future<void> _saveService({
    required int serviceId,
    required String price,
    required bool isActive,
  }) async {
    setState(() {
      _mutatingServiceId = serviceId;
      _error = null;
    });
    try {
      final saved = await widget.workspace.upsertService(
        serviceId: serviceId,
        price: price,
        isActive: isActive,
      );
      if (!mounted) return;
      setState(() {
        final items = [...?_own];
        final index = items.indexWhere((item) => item.serviceId == serviceId);
        if (index == -1) {
          items.add(saved);
        } else {
          final existing = items[index];
          items[index] = ExpertService(
            expertId: saved.expertId ?? existing.expertId,
            serviceId: saved.serviceId,
            name: saved.name ?? existing.name,
            description: saved.description ?? existing.description,
            durationMin: saved.durationMin ?? existing.durationMin,
            price: saved.price,
            currency: saved.currency,
            isActive: saved.isActive,
            serviceIsActive: saved.serviceIsActive ?? existing.serviceIsActive,
          );
        }
        _own = items;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.lamsa.serviceSaved)));
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) setState(() => _error = context.lamsa.updateFailed);
    } finally {
      if (mounted) setState(() => _mutatingServiceId = null);
    }
  }
}
