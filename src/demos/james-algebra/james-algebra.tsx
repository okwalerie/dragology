import _ from "lodash";
import { demo } from "../../demo";
import { DemoDraggable, DemoWithConfig } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { type DragSpecBuilder, param } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import {
  allRewrites,
  type Form,
  type State,
  mkState,
  R,
  S,
} from "./forms";

// ── Initial state ──

const initialState: State = mkState(
  [R(S(R())), 20, 30],        // ([ () ]) — clarifies to ()
  [R(S(R(), R())), 100, 30],  // ([ () () ]) — clarifies to () ()
);

// ── Colors ──

const COLORS: Record<string, { fill: string; stroke: string }> = {
  round:  { fill: "#fde68a", stroke: "#b45309" },
  square: { fill: "#bfdbfe", stroke: "#1d4ed8" },
  angle:  { fill: "#e9d5ff", stroke: "#7e22ce" },
};

// ── Layout ──

const PAD = 8;
const GAP = 6;
const EMPTY_SIZE = 18;

export function measure(form: Form): { w: number; h: number } {
  if (form.children.length === 0) {
    return { w: EMPTY_SIZE + PAD * 2, h: EMPTY_SIZE + PAD * 2 };
  }
  const cs = form.children.map(measure);
  const innerW = _.sumBy(cs, (c) => c.w) + GAP * (cs.length - 1);
  const innerH = _.max(cs.map((c) => c.h))!;
  return { w: innerW + PAD * 2, h: innerH + PAD * 2 };
}

// ── Render a form (not a root — no position) ──

function renderForm(
  state: State,
  form: Form,
  d: DragSpecBuilder<State>,
  depth: number,
): { element: Svgx; w: number; h: number } {
  const { w, h } = measure(form);
  const colors = COLORS[form.boundary] ?? COLORS.round;

  // render children horizontally
  const childElements: Svgx[] = [];
  let x = PAD;
  for (const child of form.children) {
    const cr = renderForm(state, child, d, depth + 1);
    const yOff = PAD + (h - PAD * 2 - cr.h) / 2;
    childElements.push(
      <g transform={translate(x, yOff)}>{cr.element}</g>,
    );
    x += cr.w + GAP;
  }

  // shape
  const rx =
    form.boundary === "round"
      ? Math.min(12, w * 0.2)
      : form.boundary === "square"
        ? 2
        : 0;

  let shape: Svgx;
  if (form.boundary === "angle") {
    const cx = w / 2, cy = h / 2;
    shape = (
      <polygon
        points={`${cx},1 ${w - 1},${cy} ${cx},${h - 1} 1,${cy}`}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={1.5}
        fillOpacity={0.35}
      />
    );
  } else {
    shape = (
      <rect
        x={0} y={0} width={w} height={h} rx={rx}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={1.5}
        fillOpacity={0.35}
      />
    );
  }

  const element = (
    <g
      id={form.id}
      dragology={() => dragSpec(d, state, form.id)}
      dragologyZIndex={depth}
      dragologyEmergeFrom={form.emergeFrom}
    >
      {shape}
      {childElements}
    </g>
  );

  return { element, w, h };
}

// ── Drag spec ──

function dragSpec(
  d: DragSpecBuilder<State>,
  state: State,
  draggedId: string,
) {
  const targets = allRewrites(state, draggedId);

  if (targets.length === 0) {
    // No rewrite targets — check if this is a root form.
    // If so, allow free positioning via d.vary.
    const rootIdx = state.roots.findIndex((r) => r.id === draggedId);
    if (rootIdx >= 0) {
      return d.vary(state, [
        param("roots", rootIdx, "x"),
        param("roots", rootIdx, "y"),
      ]);
    }
    // Non-root with no targets: fixed
    return d.between([state]);
  }

  // Has rewrite targets — interpolate toward them.
  // Also include the current state as a "stay put" option.
  return d
    .closest(targets.map((t) => d.between([state, t])))
    .withSnapRadius(1, { chain: true });
}

// ── Draggable: render all roots at their x,y positions ──

const draggable: Draggable<State> = ({ state, d }) => {
  return (
    <g>
      {state.roots.map((root, idx) => {
        const r = renderForm(state, root, d, 0);
        return (
          <g id={`root-slot-${idx}`} transform={translate(root)}>
            {r.element}
          </g>
        );
      })}
    </g>
  );
};

// ── Demo ──

export default demo(
  () => (
    <DemoWithConfig>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={400}
        height={200}
      />
    </DemoWithConfig>
  ),
  { tags: ["d.between", "spec.withSnapRadius [w/chain]", "d.vary", "math"] },
);
