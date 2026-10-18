import { useTranslations } from '@/hooks/use-translations';
import { VEHICLE_IDS, vehicleById } from '@/lib/edu-kart/physics';
import { LAP_CHOICES, TRACK_IDS, type TrackId } from '@/lib/edu-kart/protocol';
import { cn } from '@/lib/utils';
import { Bot, CarFront, Flag, Palmtree, Trees } from 'lucide-react';

const TRACK_ICONS: Record<TrackId, typeof Trees> = {
    forest: Trees,
    beach: Palmtree,
    mandalika: Flag,
};

const TRACK_TONES: Record<TrackId, string> = {
    forest: '#bbf7d0',
    beach: '#bae6fd',
    mandalika: '#fecdd3',
};

/** Kart colours used in the picker swatches (scene paints with the seat colour). */
const VEHICLE_TONES: Record<string, string> = {
    classic: '#fb923c',
    formula: '#f43f5e',
    buggy: '#facc15',
    hover: '#22d3ee',
    monster: '#84cc16',
    bajaj: '#3b82f6',
    drifter: '#a855f7',
    rocket: '#ef4444',
};

const STAT_MAX = { top: 27.5, accel: 16, turn: 2.25 };

function StatBar({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <span className="w-14 shrink-0 truncate">{label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full border border-[#1f2a44] bg-white">
                <span
                    className="block h-full bg-[#1f2a44]"
                    style={{ width: `${Math.round(value * 100)}%` }}
                />
            </span>
        </div>
    );
}

/** Host settings: circuit, laps and bots. */
export function RaceSettings({
    track,
    laps,
    bots,
    disabled,
    onChange,
}: {
    track: string;
    laps: number;
    bots: boolean;
    disabled: boolean;
    onChange: (settings: {
        track?: string;
        laps?: number;
        bots?: boolean;
    }) => void;
}) {
    const { t } = useTranslations();
    return (
        <div className="flex flex-col gap-5" data-testid="ek-settings">
            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">
                    {t('eduKart.track.label')}
                </legend>
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
                    {TRACK_IDS.map((id) => {
                        const Icon = TRACK_ICONS[id];
                        const selected = id === track;
                        return (
                            <label
                                key={id}
                                data-testid={`ek-track-${id}`}
                                className={cn(
                                    'flex min-h-16 cursor-pointer items-center gap-2 rounded-xl border-2 border-[#1f2a44] px-3 py-2 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#6c5ce7]/40 min-[420px]:flex-col min-[420px]:text-center',
                                    selected
                                        ? 'shadow-[2px_2px_0_#1f2a44]'
                                        : 'bg-white hover:bg-[#fff9e6]',
                                    disabled && 'cursor-not-allowed opacity-60',
                                )}
                                style={
                                    selected
                                        ? { background: TRACK_TONES[id] }
                                        : undefined
                                }
                            >
                                <input
                                    type="radio"
                                    name="ek-track"
                                    className="sr-only"
                                    value={id}
                                    checked={selected}
                                    disabled={disabled}
                                    onChange={() => onChange({ track: id })}
                                />
                                <Icon
                                    className="size-6 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-sm font-black break-words">
                                        {t(`eduKart.track.${id}.name`)}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-600">
                                        {t(`eduKart.track.${id}.note`)}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-semibold">
                        {t('eduKart.laps')}
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                        {LAP_CHOICES.map((n) => (
                            <label
                                key={n}
                                data-testid={`ek-laps-${n}`}
                                className={cn(
                                    'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1f2a44] text-sm font-black has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#6c5ce7]/40',
                                    n === laps
                                        ? 'bg-[#fde68a] shadow-[2px_2px_0_#1f2a44]'
                                        : 'bg-white hover:bg-[#fff9e6]',
                                    disabled && 'cursor-not-allowed opacity-60',
                                )}
                            >
                                <input
                                    type="radio"
                                    name="ek-laps"
                                    className="sr-only"
                                    checked={n === laps}
                                    disabled={disabled}
                                    onChange={() => onChange({ laps: n })}
                                />
                                {t('eduKart.lapCount', { count: n })}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <label
                    className={cn(
                        'flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-2 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#6c5ce7]/40',
                        disabled && 'cursor-not-allowed opacity-60',
                    )}
                    data-testid="ek-bots"
                >
                    <input
                        type="checkbox"
                        className="size-5 accent-[#e11d48]"
                        checked={bots}
                        disabled={disabled}
                        onChange={(event) =>
                            onChange({ bots: event.target.checked })
                        }
                    />
                    <Bot className="size-5 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-black">
                        {t('eduKart.bots')}
                    </span>
                </label>
            </div>
        </div>
    );
}

/** Every player picks a kart (CTR-style class stats). */
export function VehiclePicker({
    value,
    disabled,
    onChange,
}: {
    value: string;
    disabled: boolean;
    onChange: (vehicle: string) => void;
}) {
    const { t } = useTranslations();
    return (
        <fieldset className="flex flex-col gap-2" data-testid="ek-vehicles">
            <legend className="mb-1 text-sm font-semibold">
                {t('eduKart.vehicle.label')}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VEHICLE_IDS.map((id) => {
                    const veh = vehicleById(id);
                    const selected = id === value;
                    return (
                        <label
                            key={id}
                            data-testid={`ek-vehicle-${id}`}
                            className={cn(
                                'flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl border-2 border-[#1f2a44] p-2 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#6c5ce7]/40',
                                selected
                                    ? 'bg-[#fff1f2] shadow-[3px_3px_0_#1f2a44]'
                                    : 'bg-white hover:bg-[#fff9e6]',
                                disabled && 'cursor-not-allowed opacity-60',
                            )}
                        >
                            <input
                                type="radio"
                                name="ek-vehicle"
                                className="sr-only"
                                checked={selected}
                                disabled={disabled}
                                onChange={() => onChange(id)}
                            />
                            <span className="flex items-center gap-2">
                                <span
                                    className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44]"
                                    style={{ background: VEHICLE_TONES[id] }}
                                    aria-hidden="true"
                                >
                                    <CarFront className="size-4 text-[#1f2a44]" />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-black">
                                        {t(`eduKart.vehicle.${id}`)}
                                    </span>
                                    <span className="truncate text-[11px] font-bold text-slate-600">
                                        {t(
                                            `eduKart.vehicle.class.${veh.class}`,
                                        )}
                                    </span>
                                </span>
                            </span>
                            <StatBar
                                label={t('eduKart.vehicle.speed')}
                                value={veh.top / STAT_MAX.top}
                            />
                            <StatBar
                                label={t('eduKart.vehicle.accel')}
                                value={veh.accel / STAT_MAX.accel}
                            />
                            <StatBar
                                label={t('eduKart.vehicle.turn')}
                                value={veh.turn / STAT_MAX.turn}
                            />
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
