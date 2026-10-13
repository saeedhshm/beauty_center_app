import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

class AddressesScreen extends StatefulWidget {
  const AddressesScreen({
    required this.gateway,
    required this.catalogGateway,
    super.key,
  });

  final AddressGateway gateway;
  final CatalogGateway catalogGateway;

  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  List<CustomerAddress> _addresses = const [];
  List<CatalogCity> _cities = const [];
  int _page = 1;
  bool _hasNext = false;
  bool _loading = true;
  bool _loadingMore = false;
  String? _mutatingId;
  Object? _error;
  int _requestGeneration = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(context.lamsa.addresses),
        actions: [
          IconButton(
            key: const Key('add-address'),
            tooltip: context.lamsa.addAddress,
            onPressed: _cities.isEmpty || _loading ? null : () => _openForm(),
            icon: const Icon(Icons.add_location_alt_outlined),
          ),
        ],
      ),
      body: SafeArea(child: _body()),
    );
  }

  Widget _body() {
    if (_loading) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.loadingAddresses,
        message: context.lamsa.loadingAddressesMessage,
      );
    }
    if (_error != null && _addresses.isEmpty) {
      final forbidden =
          _error is ApiFailure &&
          (_error! as ApiFailure).kind == ApiFailureKind.forbidden;
      return LamsaStatusView(
        status: forbidden ? LamsaStatus.forbidden : LamsaStatus.error,
        title: forbidden
            ? context.lamsa.forbiddenTitle
            : context.lamsa.requestFailed,
        message: _error is ApiFailure
            ? (_error! as ApiFailure).message
            : context.lamsa.unexpectedError,
        onRetry: _load,
      );
    }
    if (_cities.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.empty,
        title: context.lamsa.noCities,
        message: context.lamsa.noCitiesMessage,
        onRetry: _load,
      );
    }
    if (_addresses.isEmpty) {
      return LamsaStatusView(
        status: LamsaStatus.empty,
        title: context.lamsa.noAddresses,
        message: context.lamsa.noAddressesMessage,
      );
    }
    return RefreshIndicator(
      onRefresh: _refreshAddresses,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: _addresses.length + (_hasNext || _error != null ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index == _addresses.length) {
            if (_error != null) {
              return Center(
                child: TextButton(
                  onPressed: _loadMore,
                  child: Text(context.lamsa.retry),
                ),
              );
            }
            return LamsaButton(
              key: const Key('addresses-load-more'),
              label: context.lamsa.loadMore,
              loading: _loadingMore,
              onPressed: _loadingMore ? null : _loadMore,
            );
          }
          final address = _addresses[index];
          final city = _cities
              .where((item) => item.id == address.cityId)
              .map((item) => item.name)
              .firstOrNull;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 800),
              child: LamsaCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.location_on_outlined),
                      title: Text(address.label),
                      subtitle: Text([address.addressText, ?city].join('\n')),
                      trailing: address.isDefault
                          ? Chip(label: Text(context.lamsa.defaultAddress))
                          : null,
                    ),
                    Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 8,
                      children: [
                        if (!address.isDefault)
                          TextButton(
                            onPressed: _mutatingId == null
                                ? () => _setDefault(address)
                                : null,
                            child: Text(context.lamsa.makeDefault),
                          ),
                        TextButton(
                          onPressed: _mutatingId == null
                              ? () => _openForm(address)
                              : null,
                          child: Text(context.lamsa.edit),
                        ),
                        TextButton(
                          onPressed: _mutatingId == null
                              ? () => _confirmDelete(address)
                              : null,
                          child: Text(context.lamsa.delete),
                        ),
                        if (_mutatingId == address.id)
                          const Padding(
                            padding: EdgeInsets.all(8),
                            child: SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _load() async {
    final generation = ++_requestGeneration;
    setState(() {
      _loading = true;
      _loadingMore = false;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.catalogGateway.cities(),
        widget.gateway.list(),
      ]);
      final addresses = results[1] as CatalogPage<CustomerAddress>;
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _cities = (results[0] as List<CatalogCity>)
            .where((city) => city.isActive)
            .toList(growable: false);
        _addresses = addresses.items;
        _page = addresses.page;
        _hasNext = addresses.hasNext;
      });
    } catch (error) {
      if (mounted && generation == _requestGeneration) {
        setState(() => _error = error);
      }
    } finally {
      if (mounted && generation == _requestGeneration) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _refreshAddresses() async {
    final generation = ++_requestGeneration;
    setState(() {
      _error = null;
      _page = 1;
      _loadingMore = false;
    });
    try {
      final result = await widget.gateway.list();
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _addresses = result.items;
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (mounted && generation == _requestGeneration) {
        setState(() => _error = error);
      }
    }
  }

  Future<void> _loadMore() async {
    final generation = _requestGeneration;
    final page = _page;
    setState(() {
      _loadingMore = true;
      _error = null;
    });
    try {
      final result = await widget.gateway.list(page: page + 1);
      if (!mounted || generation != _requestGeneration || _page != page) {
        return;
      }
      setState(() {
        _addresses = [..._addresses, ...result.items];
        _page = result.page;
        _hasNext = result.hasNext;
      });
    } catch (error) {
      if (mounted && generation == _requestGeneration && _page == page) {
        setState(() => _error = error);
      }
    } finally {
      if (mounted && generation == _requestGeneration && _page == page) {
        setState(() => _loadingMore = false);
      }
    }
  }

  Future<void> _openForm([CustomerAddress? address]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AddressFormScreen(
          gateway: widget.gateway,
          cities: _cities,
          address: address,
        ),
      ),
    );
    if (saved == true) await _refreshAddresses();
  }

  Future<void> _setDefault(CustomerAddress address) async {
    setState(() => _mutatingId = address.id);
    try {
      await widget.gateway.update(
        address.id,
        const AddressDraft(isDefault: true),
      );
      await _refreshAddresses();
      if (mounted) _showSuccess(context.lamsa.defaultAddressUpdated);
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _mutatingId = null);
    }
  }

  Future<void> _confirmDelete(CustomerAddress address) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.lamsa.deleteAddressTitle),
        content: Text(context.lamsa.deleteAddressMessage(address.label)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.lamsa.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.lamsa.delete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _mutatingId = address.id);
    try {
      await widget.gateway.delete(address.id);
      await _refreshAddresses();
      if (mounted) _showSuccess(context.lamsa.addressDeleted);
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _mutatingId = null);
    }
  }

  void _showSuccess(String message) => ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message)));

  void _showError(Object error) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        error is ApiFailure ? error.message : context.lamsa.unexpectedError,
      ),
    ),
  );
}

class AddressFormScreen extends StatefulWidget {
  const AddressFormScreen({
    required this.gateway,
    required this.cities,
    this.address,
    super.key,
  });

  final AddressGateway gateway;
  final List<CatalogCity> cities;
  final CustomerAddress? address;

  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  static final _coordinatePattern = RegExp(r'^-?\d{1,3}(?:\.\d{1,6})?$');
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _label;
  late final TextEditingController _addressText;
  late final TextEditingController _lat;
  late final TextEditingController _lng;
  late int _cityId;
  late bool _isDefault;
  bool _saving = false;
  String? _serverError;

  @override
  void initState() {
    super.initState();
    final address = widget.address;
    _label = TextEditingController(text: address?.label);
    _addressText = TextEditingController(text: address?.addressText);
    _lat = TextEditingController(text: address?.lat);
    _lng = TextEditingController(text: address?.lng);
    _cityId =
        address != null &&
            widget.cities.any((city) => city.id == address.cityId)
        ? address.cityId
        : widget.cities.first.id;
    _isDefault = address?.isDefault ?? false;
  }

  @override
  void dispose() {
    _label.dispose();
    _addressText.dispose();
    _lat.dispose();
    _lng.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.address == null
              ? context.lamsa.addAddress
              : context.lamsa.editAddress,
        ),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 620),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_serverError != null) ...[
                        Text(
                          _serverError!,
                          style: const TextStyle(color: LamsaColors.danger),
                        ),
                        const SizedBox(height: 12),
                      ],
                      LamsaTextField(
                        key: const Key('address-label'),
                        label: context.lamsa.addressLabel,
                        controller: _label,
                        validator: _validateLabel,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 12),
                      LamsaTextField(
                        key: const Key('address-text'),
                        label: context.lamsa.addressText,
                        controller: _addressText,
                        validator: _validateAddress,
                        maxLines: 3,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<int>(
                        key: const Key('address-city'),
                        initialValue: _cityId,
                        decoration: InputDecoration(
                          labelText: context.lamsa.city,
                        ),
                        items: [
                          for (final city in widget.cities)
                            DropdownMenuItem(
                              value: city.id,
                              child: Text(city.name),
                            ),
                        ],
                        onChanged: _saving
                            ? null
                            : (value) {
                                if (value != null) _cityId = value;
                              },
                      ),
                      const SizedBox(height: 18),
                      Text(context.lamsa.optionalCoordinatesTitle),
                      const SizedBox(height: 4),
                      Text(
                        context.lamsa.optionalCoordinatesMessage,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: LamsaTextField(
                              key: const Key('address-lat'),
                              label: context.lamsa.latitude,
                              controller: _lat,
                              validator: (value) => _validateCoordinate(
                                value,
                                other: _lng.text,
                                min: -90,
                                max: 90,
                              ),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                    signed: true,
                                  ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: LamsaTextField(
                              key: const Key('address-lng'),
                              label: context.lamsa.longitude,
                              controller: _lng,
                              validator: (value) => _validateCoordinate(
                                value,
                                other: _lat.text,
                                min: -180,
                                max: 180,
                              ),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                    signed: true,
                                  ),
                            ),
                          ),
                        ],
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(context.lamsa.defaultAddress),
                        value: _isDefault,
                        onChanged: _saving
                            ? null
                            : (value) => setState(() => _isDefault = value),
                      ),
                      const SizedBox(height: 20),
                      LamsaButton(
                        key: const Key('save-address'),
                        label: context.lamsa.save,
                        loading: _saving,
                        onPressed: _saving ? null : _save,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _validateLabel(String? value) {
    final length = value?.trim().length ?? 0;
    return length < 1 || length > 100
        ? context.lamsa.addressLabelValidation
        : null;
  }

  String? _validateAddress(String? value) {
    final length = value?.trim().length ?? 0;
    return length < 5 || length > 1000
        ? context.lamsa.addressTextValidation
        : null;
  }

  String? _validateCoordinate(
    String? value, {
    required String other,
    required double min,
    required double max,
  }) {
    final text = value?.trim() ?? '';
    if (text.isEmpty && other.trim().isEmpty) return null;
    if (text.isEmpty || other.trim().isEmpty) {
      return context.lamsa.coordinatesPairValidation;
    }
    if (!_coordinatePattern.hasMatch(text)) {
      return context.lamsa.coordinateRangeValidation(min, max);
    }
    final number = double.parse(text);
    if (number < min || number > max) {
      return context.lamsa.coordinateRangeValidation(min, max);
    }
    return null;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _serverError = null;
    });
    final lat = _lat.text.trim();
    final lng = _lng.text.trim();
    try {
      if (widget.address == null) {
        await widget.gateway.create(
          label: _label.text.trim(),
          addressText: _addressText.text.trim(),
          cityId: _cityId,
          lat: lat.isEmpty ? null : lat,
          lng: lng.isEmpty ? null : lng,
          isDefault: _isDefault,
        );
      } else {
        await widget.gateway.update(
          widget.address!.id,
          AddressDraft(
            label: _label.text.trim(),
            addressText: _addressText.text.trim(),
            cityId: _cityId,
            lat: lat.isEmpty ? null : lat,
            lng: lng.isEmpty ? null : lng,
            includeCoordinates: true,
            isDefault: _isDefault,
          ),
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _serverError = error is ApiFailure
            ? error.message
            : context.lamsa.unexpectedError;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
