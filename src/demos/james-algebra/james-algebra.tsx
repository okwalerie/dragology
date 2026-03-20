import _ from "lodash";
import { demo } from "../../demo";
import { DemoDraggable, DemoWithConfig } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { type DragSpecBuilder, param } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";
import {
  allClarifyRewrites,
  findAllIslands,
  floatingState,
  type Form,
  type State,
  mkState,
  R,
  S,
} from "./forms";

// ── Initial state ──
// A playground with some containers to drag things between.

const initialState: State = mkState(
  [R(S(R())), 20, 30],           // ([()]) — clarifiable
  [R(S(R(), R())), 120, 30],     // ([()()])  — clarifiable, two inner rounds
  [R(S()), 260, 30],             // ([]) — empty frame, drop target
  [R(S()), 260, 100],            // ([]) — another empty frame
  [R(), 350, 60],                // () — lone round, can be dragged into frames
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

// ── Render ──

function renderForm(
  state: State,
  form: Form,
  d: DragSpecBuilder<State>,
  depth: number,
): { element: Svgx; w: number; h: number } {
  const { w, h } = measure(form);
  const colors = COLORS[form.boundary] ?? COLORS.round;

  // render children horizontally
  // IMPORTANT: each child wrapper gets its own id so the layered SVG system
  // extracts them independently. Without this, adding/removing children
  // changes the parent's child count and breaks lerp.
  const childElements: Svgx[] = [];
  let x = PAD;
  for (let i = 0; i < form.children.length; i++) {
    const child = form.children[i];
    const cr = renderForm(state, child, d, depth + 1);
    const yOff = PAD + (h - PAD * 2 - cr.h) / 2;
    childElements.push(
      <g id={`${form.id}-slot-${i}`} transform={translate(x, yOff)}>
        {cr.element}
      </g>,
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
// Three behaviors layered:
// 1. Clarify rewrites (d.between + snap+chain) — for grandchildren of ([...])
// 2. Island snapping (d.closest + withFloating) — drag into any container
// 3. Free positioning (d.vary) — whenFar from any island, float freely

function dragSpec(
  d: DragSpecBuilder<State>,
  state: State,
  draggedId: string,
) {
  // First check for clarify rewrites (these use d.between for smooth morphing)
  const clarifyTargets = allClarifyRewrites(state, draggedId);
  if (clarifyTargets.length > 0) {
    return d
      .closest(clarifyTargets.map((t) => d.between([state, t])))
      .withSnapRadius(1, { chain: true });
  }

  // Find all islands (containers this form could snap into)
  const islands = findAllIslands(state, draggedId);

  // Build the floating/free-position backdrop
  const { stateWithout, removed } = floatingState(state, draggedId);
  if (!removed) return d.between([state]);

  // The root index in the "floating" state (we'll add it as a new root)
  const floatState: State = {
    roots: [...stateWithout.roots, { ...removed, x: 0, y: 0 }],
  };
  const floatIdx = floatState.roots.length - 1;
  const varySpec = d.vary(floatState, [
    param("roots", floatIdx, "x"),
    param("roots", floatIdx, "y"),
  ]);

  if (islands.length === 0) {
    // No islands — just free drag (root forms with no valid containers nearby)
    const rootIdx = state.roots.findIndex((r) => r.id === draggedId);
    if (rootIdx >= 0) {
      return d.vary(state, [
        param("roots", rootIdx, "x"),
        param("roots", rootIdx, "y"),
      ]);
    }
    return varySpec;
  }

  // Snap-to-islands pattern:
  // Close to an island → snap in. Far from all → free float.
  return d
    .closest(islands.map((island) => d.fixed(island.state)))
    .withFloating()
    .whenFar(varySpec);
}

// ── Draggable ──

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
        width={500}
        height={250}
      />
    </DemoWithConfig>
  ),
  {
    tags: [
      "d.between",
      "spec.withSnapRadius [w/chain]",
      "d.vary",
      "d.closest",
      "spec.withFloating",
      "spec.whenFar",
      "math",
    ],
  },
);
