// James Algebra (Laws of Form) — core types and rewrites.
//
// KEY CONSTRAINT from the dragology framework:
//   d.between([stateA, stateB]) tracks the DRAGGED element by id/path.
//   The dragged element must exist in ALL target states.
//   Elements that vanish in a rewrite can't be triggers.

export type BoundaryType = "round" | "square" | "angle";

export type Form = {
  id: string;
  boundary: BoundaryType;
  children: Form[];
  label?: string;
  emergeFrom?: string;
};

export type RootForm = Form & { x: number; y: number };

export type State = {
  roots: RootForm[];
};

// ── id generation ──

let _nextId = 0;
function fid(prefix = "f"): string {
  return `${prefix}${_nextId++}`;
}

// ── constructors ──

export const R = (...children: Form[]): Form => ({
  id: fid("r"),
  boundary: "round",
  children,
});
export const S = (...children: Form[]): Form => ({
  id: fid("s"),
  boundary: "square",
  children,
});
export const A = (...children: Form[]): Form => ({
  id: fid("a"),
  boundary: "angle",
  children,
});

export function mkState(...positioned: [Form, number, number][]): State {
  return {
    roots: positioned.map(([form, x, y]) => ({ ...form, x, y })),
  };
}

// ── tree helpers ──

function containsId(form: Form, id: string): boolean {
  if (form.id === id) return true;
  return form.children.some((c) => containsId(c, id));
}

/** Find a form by id anywhere in a tree. */
function findById(form: Form, id: string): Form | null {
  if (form.id === id) return form;
  for (const c of form.children) {
    const found = findById(c, id);
    if (found) return found;
  }
  return null;
}

/** Replace a node (by id) with zero or more replacement nodes in its parent's children. */
function replaceInForm(tree: Form, targetId: string, replacement: Form[]): Form {
  let changed = false;
  const newChildren: Form[] = [];
  for (const child of tree.children) {
    if (child.id === targetId) {
      changed = true;
      newChildren.push(...replacement);
    } else {
      const updated = replaceInForm(child, targetId, replacement);
      if (updated !== child) changed = true;
      newChildren.push(updated);
    }
  }
  return changed ? { ...tree, children: newChildren } : tree;
}

/** Add a child to a specific parent node. */
function addChildToForm(tree: Form, parentId: string, child: Form): Form {
  if (tree.id === parentId) {
    return { ...tree, children: [...tree.children, child] };
  }
  let changed = false;
  const newChildren = tree.children.map((c) => {
    const updated = addChildToForm(c, parentId, child);
    if (updated !== c) changed = true;
    return updated;
  });
  return changed ? { ...tree, children: newChildren } : tree;
}

/** Remove a form from the state. Returns the removed form and the new state. */
export function removeFromState(
  state: State,
  targetId: string,
): { removed: Form | null; newState: State } {
  // Check if it's a root
  const rootIdx = state.roots.findIndex((r) => r.id === targetId);
  if (rootIdx >= 0) {
    const removed = state.roots[rootIdx];
    return {
      removed,
      newState: { roots: state.roots.filter((_, i) => i !== rootIdx) },
    };
  }
  // It's nested — remove from parent
  for (const root of state.roots) {
    const found = findById(root, targetId);
    if (found) {
      const newRoots = state.roots.map((r) => {
        const updated = replaceInForm(r, targetId, []);
        return updated === r ? r : { ...updated, x: r.x, y: r.y };
      });
      return { removed: found, newState: { roots: newRoots } };
    }
  }
  return { removed: null, newState: state };
}

/** Add a form as a child of a specific parent in the state. */
function addToParent(state: State, parentId: string, child: Form): State {
  return {
    roots: state.roots.map((r) => {
      const updated = addChildToForm(r, parentId, child);
      return updated === r ? r : { ...updated, x: r.x, y: r.y };
    }),
  };
}

// ── Find all "islands" — places a form could be dropped ──
// An island is any form that could accept a child.
// For james algebra: any boundary node can contain children.
// We exclude the dragged form itself and its descendants.

export type Island = {
  parentId: string;
  state: State;
};

export function findAllIslands(
  state: State,
  draggedId: string,
): Island[] {
  const { removed, newState } = removeFromState(state, draggedId);
  if (!removed) return [];

  const islands: Island[] = [];

  function walkForm(form: Form) {
    // Any boundary node is a valid drop target
    islands.push({
      parentId: form.id,
      state: addToParent(newState, form.id, removed!),
    });

    for (const child of form.children) {
      walkForm(child);
    }
  }

  for (const root of newState.roots) {
    walkForm(root);
  }

  return islands;
}

/** State where the dragged form becomes a free-floating root. */
export function floatingState(
  state: State,
  draggedId: string,
): { stateWithout: State; removed: Form | null } {
  const { removed, newState } = removeFromState(state, draggedId);
  return { stateWithout: newState, removed };
}

// ── Clarify rewrite ──

function invertiblePair(a: BoundaryType, b: BoundaryType): boolean {
  return (
    (a === "round" && b === "square") || (a === "square" && b === "round")
  );
}

function isClarifiable(form: Form): boolean {
  return (
    form.children.length === 1 &&
    invertiblePair(form.boundary, form.children[0].boundary)
  );
}

function replaceInState(
  state: State,
  targetId: string,
  replacement: Form[],
): State {
  const newRoots: RootForm[] = [];
  for (const root of state.roots) {
    if (root.id === targetId) {
      let xOff = 0;
      for (const r of replacement) {
        newRoots.push({ ...r, x: Math.round(root.x + xOff), y: Math.round(root.y) });
        xOff += 60;
      }
    } else {
      const updated = replaceInForm(root, targetId, replacement);
      if (updated === root) {
        newRoots.push(root);
      } else {
        newRoots.push({ ...updated, x: root.x, y: root.y });
      }
    }
  }
  return { roots: newRoots };
}

export function allClarifyRewrites(
  state: State,
  triggerId: string,
): State[] {
  const results: State[] = [];

  function walkClarify(form: Form) {
    if (isClarifiable(form)) {
      const inner = form.children[0];
      const grandchildHasTrigger = inner.children.some((gc) =>
        containsId(gc, triggerId),
      );
      if (grandchildHasTrigger) {
        const grandchildren = inner.children;
        results.push(replaceInState(state, form.id, grandchildren));
      }
    }
    for (const child of form.children) {
      walkClarify(child);
    }
  }

  for (const root of state.roots) {
    walkClarify(root);
  }

  return results;
}
