import React from 'react';
import { type PlanWeekActivityItem } from '../utils/planDataFoundation';
import { parseLocalDateKey } from '../utils/weeklyPlanStore';
import { WorkoutActivityIcon, getWorkoutDisplayLabel } from './WorkoutActivityIcon';

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatShortDate(dateKey: string): string {
  const localDt = parseLocalDateKey(dateKey);
  return localDt
    ? `${SHORT_WEEKDAYS[localDt.getDay()]}, ${SHORT_MONTH_NAMES[localDt.getMonth()]} ${localDt.getDate()}`
    : dateKey;
}

function formatMetaTimestamp(
  dateKey: string,
  iso: string,
  hasExactTime: boolean,
  showDate: boolean
): string | null {
  const datePart = showDate ? formatShortDate(dateKey) : null;
  let timePart: string | null = null;
  if (hasExactTime) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  }
  if (datePart && timePart) return `${datePart} · ${timePart}`;
  if (datePart) return datePart;
  if (timePart) return timePart;
  return null;
}

interface ActivityRecordRowProps {
  item: PlanWeekActivityItem;
  activeFilterKey?: string | null;
  /** When true (e.g. This week all-days list), prepends the short date before time & source */
  showDateInMeta?: boolean;
  /** Optional right-side action control (e.g. History per-record edit/correction button) */
  actionSlot?: React.ReactNode;
  /** Optional data attribute prefix for testing/inspection */
  dataAttrPrefix?: 'week' | 'history';
}

export function ActivityRecordRow({
  item,
  activeFilterKey = null,
  showDateInMeta = true,
  actionSlot = null,
  dataAttrPrefix = 'week',
}: ActivityRecordRowProps) {
  const visibleSegments =
    item.segments && item.segments.length > 0
      ? activeFilterKey
        ? item.segments.filter((seg) => seg.workoutTypeKey === activeFilterKey)
        : item.segments
      : [];

  const timePrefix = formatMetaTimestamp(
    item.dateKey,
    item.occurredAt,
    item.hasExactTimestamp,
    showDateInMeta
  );
  const metaLine = timePrefix ? `${timePrefix} · ${item.sourceLabel}` : item.sourceLabel;

  const dataAttrs =
    dataAttrPrefix === 'history'
      ? {
          'data-history-activity-item': item.id,
          'data-history-activity-date': item.dateKey,
          'data-history-activity-kind': item.kind,
          'data-history-activity-source': item.recordSource ?? item.kind,
        }
      : {
          'data-week-activity-item': item.id,
          'data-week-activity-date': item.dateKey,
          'data-week-activity-kind': item.kind,
        };

  return (
    <div {...dataAttrs} className="min-h-[60px] py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[15px] font-medium leading-[21px] text-[#302D3D] truncate">
            {item.title}
          </span>
          <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
            {metaLine}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.trustworthyDurationMinutes !== null && visibleSegments.length <= 1 && (
            <span className="text-[13px] font-medium leading-[18px] text-[#5E5BAE] tabular-nums whitespace-nowrap shrink-0">
              {item.trustworthyDurationMinutes} min
            </span>
          )}
          {actionSlot}
        </div>
      </div>

      {visibleSegments.length > 0 && (
        <div className="flex flex-col gap-1.5 pl-0.5">
          {visibleSegments.map((seg, idx) => {
            const segDisplayLabel = getWorkoutDisplayLabel(
              seg.workoutTypeKey,
              seg.workoutTypeLabel
            );
            const showDistinctTitle =
              seg.title.trim().toLowerCase() !== segDisplayLabel.trim().toLowerCase() &&
              seg.title.trim().toLowerCase() !== seg.workoutTypeLabel.trim().toLowerCase();
            return (
              <div
                key={`${item.id}-seg-${idx}`}
                data-activity-segment={seg.workoutTypeKey}
                className="flex items-center justify-between gap-2 text-[13px] leading-[18px]"
              >
                <span className="flex items-center gap-2 min-w-0 text-[#524C63]">
                  <WorkoutActivityIcon
                    typeKey={seg.workoutTypeKey}
                    size={16}
                    className="shrink-0 text-[#625A76]"
                  />
                  <span className="truncate font-medium text-[#302D3D]">
                    {segDisplayLabel}
                  </span>
                  {showDistinctTitle && (
                    <span className="truncate text-[#706A7C]">· {seg.title}</span>
                  )}
                </span>
                {seg.trustworthyDurationMinutes !== null && visibleSegments.length > 1 && (
                  <span className="text-[#5E5BAE] font-medium tabular-nums whitespace-nowrap shrink-0">
                    {seg.trustworthyDurationMinutes} min
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {item.note && item.note.trim().length > 0 && (
        <p className="text-[13px] font-normal leading-[18px] text-[#625B70] break-words">
          {item.note.trim()}
        </p>
      )}
    </div>
  );
}
