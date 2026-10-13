import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

/// Expert weekly schedule and exceptions management (A4).
///
/// Edits stay local until the server confirms a full-schedule PUT. Any 409 or
/// 422 reloads the authoritative state and explains it instead of claiming a
/// local success.
class ExpertAvailabilityScreen extends StatefulWidget {
  const ExpertAvailabilityScreen({
    required this.availability,
    this.refreshSignal,
    super.key,
  });

  final AvailabilityGateway availability;
  final Listenable? refreshSignal;

  @override
  State<ExpertAvailabilityScreen> createState() =>
      _ExpertAvailabilityScreenState();
}

class _IntervalDraft {
  _IntervalDraft(this.start, this.end);
  String start;
  String end;
}

class _ExpertAvailabilityScreenState extends State<ExpertAvailabilityScreen> {
  Map<int, List<_IntervalDraft>>? _week;
  List<AvailabilityExceptionItem>? _exceptions;
  ApiFailureKind? _failureKind;
  String? _error;
  bool _saving = false;
  bool _loadingExceptions = false;

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_load);
    _load();
  }

  @override
  void didUpdateWidget(covariant ExpertAvailabilityScreen oldWidget) {
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

  List<WeeklySlot> get _flattened => [
    for (final entry in (_week ?? {}).entries)
      for (final draft in entry.value)
        WeeklySlot(
          dayOfWeek: entry.key,
          startTime: draft.start,
          endTime: draft.end,
        ),
  ];

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _error = null;
      _failureKind = null;
    });
    try {
      final week = await widget.availability.weekly();
      final exceptions = await widget.availability.exceptions();
      if (!mounted) return;
      final grouped = <int, List<_IntervalDraft>>{
        for (var day = 1; day <= 7; day++) day: [],
      };
      for (final slot in week) {
        grouped[slot.dayOfWeek]?.add(
          _IntervalDraft(slot.startTime, slot.endTime),
        );
      }
      setState(() {
        _week = grouped;
        _exceptions = exceptions;
      });
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _week = null;
          _error = failure.message;
          _failureKind = failure.kind;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _week = null;
          _error = context.lamsa.availabilityLoadFailed;
        });
      }
    }
  }

  Future<void> _save() async {
    final week = _week;
    if (week == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await widget.availability.replaceWeekly(_flattened);
      if (!mounted) return;
      final grouped = <int, List<_IntervalDraft>>{
        for (var day = 1; day <= 7; day++) day: [],
      };
      for (final slot in saved) {
        grouped[slot.dayOfWeek]?.add(
          _IntervalDraft(slot.startTime, slot.endTime),
        );
      }
      setState(() {
        _week = grouped;
        _saving = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.lamsa.scheduleSaved)),
        );
      }
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _saving = false);
      if (failure.kind == ApiFailureKind.conflict ||
          failure.kind == ApiFailureKind.validation) {
        setState(() => _error = context.lamsa.scheduleConflict);
        await _load();
      } else if (mounted) {
        setState(() {
          _error = failure.message;
          _failureKind = failure.kind;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = context.lamsa.updateFailed;
        });
      }
    }
  }

  Future<void> _addInterval(int day) async {
    final week = _week;
    if (week == null) return;
    if ((week[day] ?? []).length >= 3) {
      setState(() => _error = context.lamsa.maxIntervalsPerDay);
      return;
    }
    final draft = await _requestInterval(context, null);
    if (draft == null || !mounted) return;
    setState(() => week[day]!.add(draft));
    _validateLocal();
  }

  void _validateLocal() {
    final week = _week;
    if (week == null) return;
    for (final entry in week.entries) {
      final slots = [
        for (final draft in entry.value)
          WeeklySlot(
            dayOfWeek: entry.key,
            startTime: draft.start,
            endTime: draft.end,
          ),
      ];
      if (areIntervalsValid(slots)) continue;
      var message = context.lamsa.overlappingIntervals;
      for (final slot in slots) {
        if (_minutes(slot.startTime) >= _minutes(slot.endTime)) {
          message = context.lamsa.endMustBeAfterStart;
          break;
        }
        if (!isWithinDaytime(slot.startTime, slot.endTime)) {
          message = context.lamsa.outsideDaytime;
          break;
        }
      }
      setState(() => _error = message);
      return;
    }
    setState(() => _error = null);
  }

  int _minutes(String value) {
    final parts = value.split(':');
    return int.parse(parts[0]) * 60 + int.parse(parts[1]);
  }

  Future<void> _addException() async {
    final created = await _requestException(context);
    if (created == null || !mounted) return;
    setState(() => _loadingExceptions = true);
    try {
      final item = await widget.availability.addException(
        date: created.date,
        startTime: created.startTime,
        endTime: created.endTime,
        type: created.type,
        reason: created.reason,
      );
      if (!mounted) return;
      setState(() {
        _exceptions = [...?_exceptions, item];
        _loadingExceptions = false;
      });
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _loadingExceptions = false;
          _error = failure.kind == ApiFailureKind.conflict
              ? context.lamsa.scheduleConflict
              : failure.message;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _loadingExceptions = false;
          _error = context.lamsa.updateFailed;
        });
      }
    }
  }

  Future<void> _deleteException(AvailabilityExceptionItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(dialogContext.lamsa.deleteException),
        content: Text(dialogContext.lamsa.deleteExceptionConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(dialogContext.lamsa.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(dialogContext.lamsa.confirm),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.availability.deleteException(item.id);
      if (!mounted) return;
      setState(() {
        _exceptions = _exceptions
            ?.where((entry) => entry.id != item.id)
            .toList(growable: false);
      });
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() => _error = failure.message);
      }
    } on Object {
      if (mounted) {
        setState(() => _error = context.lamsa.updateFailed);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_week == null && _error == null) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.availability,
        message: context.lamsa.loadingAvailability,
      );
    }
    if (_week == null) {
      return LamsaStatusView(
        status: _failureKind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.availabilityLoadFailed,
        message: _error ?? context.lamsa.tryAgain,
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: LamsaSpacing.md),
              child: LamsaStatusView(
                status: LamsaStatus.error,
                title: context.lamsa.updateFailed,
                message: _error!,
                onRetry: _load,
              ),
            ),
          Text(
            context.lamsa.weeklySchedule,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            context.lamsa.weeklyScheduleHint,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          for (var day = 1; day <= 7; day++) _dayCard(day),
          const SizedBox(height: 12),
          FilledButton(
            key: const ValueKey('availability-save'),
            onPressed: _saving ? null : _save,
            child: Text(
              _saving ? context.lamsa.saving : context.lamsa.saveSchedule,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            context.lamsa.exceptions,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            context.lamsa.exceptionsHint,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if ((_exceptions ?? []).isEmpty && !_loadingExceptions)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.exceptions,
              message: context.lamsa.noExceptions,
            ),
          for (final item in _exceptions ?? []) _exceptionTile(item),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const ValueKey('exception-add'),
            onPressed: _loadingExceptions ? null : _addException,
            icon: const Icon(Icons.event_busy_outlined),
            label: Text(context.lamsa.addException),
          ),
        ],
      ),
    );
  }

  Widget _dayCard(int day) {
    final intervals = _week?[day] ?? [];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.lamsa.weekdayName(day),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                TextButton.icon(
                  key: ValueKey('interval-add-$day'),
                  onPressed: () => _addInterval(day),
                  icon: const Icon(Icons.add),
                  label: Text(context.lamsa.addInterval),
                ),
              ],
            ),
            if (intervals.isEmpty)
              Text(
                context.lamsa.dayClosed,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            for (var i = 0; i < intervals.length; i++)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(
                  '${intervals[i].start} – ${intervals[i].end}',
                  textDirection: TextDirection.ltr,
                ),
                trailing: IconButton(
                  key: ValueKey('interval-delete-$day-$i'),
                  tooltip: context.lamsa.deleteInterval,
                  onPressed: () {
                    setState(() => intervals.removeAt(i));
                    _validateLocal();
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _exceptionTile(AvailabilityExceptionItem item) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(item.date, textDirection: TextDirection.ltr),
        subtitle: Text(
          item.isFullDay
              ? '${item.isUnavailable ? context.lamsa.unavailableException : context.lamsa.availableException} · ${context.lamsa.fullDayLeave}'
              : '${item.isUnavailable ? context.lamsa.unavailableException : context.lamsa.availableException} · ${item.startTime} – ${item.endTime}',
        ),
        trailing: IconButton(
          key: ValueKey('exception-delete-${item.id}'),
          tooltip: context.lamsa.deleteException,
          onPressed: () => _deleteException(item),
          icon: const Icon(Icons.delete_outline),
        ),
      ),
    );
  }
}

Future<_IntervalDraft?> _requestInterval(
  BuildContext context,
  _IntervalDraft? initial,
) => showDialog<_IntervalDraft>(
  context: context,
  builder: (dialogContext) => _IntervalDialog(initial: initial),
);

class _IntervalDialog extends StatefulWidget {
  const _IntervalDialog({this.initial});

  final _IntervalDraft? initial;

  @override
  State<_IntervalDialog> createState() => _IntervalDialogState();
}

class _IntervalDialogState extends State<_IntervalDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _startController;
  late final TextEditingController _endController;

  @override
  void initState() {
    super.initState();
    _startController = TextEditingController(text: widget.initial?.start ?? '');
    _endController = TextEditingController(text: widget.initial?.end ?? '');
  }

  @override
  void dispose() {
    _startController.dispose();
    _endController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.lamsa.addInterval),
    content: Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextFormField(
            key: const ValueKey('interval-start'),
            controller: _startController,
            keyboardType: TextInputType.datetime,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(
              labelText: context.lamsa.startTime,
              hintText: '09:00',
            ),
            validator: (value) => _clockError(context, value),
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('interval-end'),
            controller: _endController,
            keyboardType: TextInputType.datetime,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(
              labelText: context.lamsa.endTime,
              hintText: '12:00',
            ),
            validator: (value) => _clockError(context, value),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: Text(context.lamsa.cancel),
      ),
      FilledButton(
        onPressed: () {
          if (_formKey.currentState?.validate() ?? false) {
            Navigator.of(context).pop(
              _IntervalDraft(
                _startController.text.trim(),
                _endController.text.trim(),
              ),
            );
          }
        },
        child: Text(context.lamsa.addInterval),
      ),
    ],
  );
}

String? _clockError(BuildContext context, String? value) {
  final text = (value ?? '').trim();
  if (!RegExp(r'^\d{2}:\d{2}$').hasMatch(text)) {
    return context.lamsa.invalidTimeFormat;
  }
  return null;
}

class _ExceptionDraft {
  _ExceptionDraft({
    required this.date,
    required this.type,
    this.startTime,
    this.endTime,
    this.reason,
  });
  String date;
  String type;
  String? startTime;
  String? endTime;
  String? reason;
}

Future<_ExceptionDraft?> _requestException(BuildContext context) =>
    showDialog<_ExceptionDraft>(
      context: context,
      builder: (dialogContext) => const _ExceptionDialog(),
    );

class _ExceptionDialog extends StatefulWidget {
  const _ExceptionDialog();

  @override
  State<_ExceptionDialog> createState() => _ExceptionDialogState();
}

class _ExceptionDialogState extends State<_ExceptionDialog> {
  final _formKey = GlobalKey<FormState>();
  final _dateController = TextEditingController();
  final _startController = TextEditingController();
  final _endController = TextEditingController();
  final _reasonController = TextEditingController();
  var _fullDay = true;
  var _type = 'unavailable';

  @override
  void dispose() {
    _dateController.dispose();
    _startController.dispose();
    _endController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.lamsa.addException),
    content: Form(
      key: _formKey,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              key: const ValueKey('exception-date'),
              controller: _dateController,
              keyboardType: TextInputType.datetime,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                labelText: context.lamsa.exceptionDate,
                hintText: '2026-10-20',
              ),
              validator: (value) {
                final text = (value ?? '').trim();
                if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text)) {
                  return context.lamsa.invalidDateFormat;
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              key: const ValueKey('exception-type'),
              initialValue: _type,
              decoration: InputDecoration(labelText: context.lamsa.exceptions),
              items: [
                DropdownMenuItem(
                  value: 'unavailable',
                  child: Text(context.lamsa.unavailableException),
                ),
                DropdownMenuItem(
                  value: 'available',
                  child: Text(context.lamsa.availableException),
                ),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _type = value);
              },
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(context.lamsa.fullDayLeave),
              value: _fullDay,
              onChanged: (value) => setState(() => _fullDay = value),
            ),
            if (!_fullDay) ...[
              TextFormField(
                key: const ValueKey('exception-start'),
                controller: _startController,
                keyboardType: TextInputType.datetime,
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(
                  labelText: context.lamsa.startTime,
                  hintText: '09:00',
                ),
                validator: (value) => _clockError(context, value),
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const ValueKey('exception-end'),
                controller: _endController,
                keyboardType: TextInputType.datetime,
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(
                  labelText: context.lamsa.endTime,
                  hintText: '12:00',
                ),
                validator: (value) => _clockError(context, value),
              ),
              const SizedBox(height: 12),
            ],
            TextFormField(
              key: const ValueKey('exception-reason'),
              controller: _reasonController,
              decoration: InputDecoration(
                labelText: context.lamsa.reasonOptional,
              ),
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: Text(context.lamsa.cancel),
      ),
      FilledButton(
        onPressed: () {
          if (_formKey.currentState?.validate() ?? false) {
            Navigator.of(context).pop(
              _ExceptionDraft(
                date: _dateController.text.trim(),
                type: _type,
                startTime: _fullDay ? null : _startController.text.trim(),
                endTime: _fullDay ? null : _endController.text.trim(),
                reason: _reasonController.text.trim().isEmpty
                    ? null
                    : _reasonController.text.trim(),
              ),
            );
          }
        },
        child: Text(context.lamsa.addException),
      ),
    ],
  );
}
