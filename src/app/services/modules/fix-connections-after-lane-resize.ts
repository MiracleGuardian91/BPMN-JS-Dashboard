// src/app/bpmn/modules/fix-connections-on-lane-resize.ts
import { is } from 'bpmn-js/lib/util/ModelUtil';

const EPS = 0.5;

function isLane(e: any) {
  return e && is(e.businessObject, 'bpmn:Lane');
}
function isParticipant(e: any) {
  return e && is(e.businessObject, 'bpmn:Participant');
}
function isConnection(e: any) {
  return !!e && !!e.waypoints;
}

function findParticipant(e: any) {
  let p = e?.parent;
  while (p && !isParticipant(p)) p = p.parent;
  return p;
}

type PreShape = { y: number };
type PreConn = { waypoints: Array<{ x: number; y: number }> };

export default {
  __init__: ['fixConnectionsOnLaneResize'],
  fixConnectionsOnLaneResize: [
    'type',
    class FixConnectionsOnLaneResize {
      static $inject = ['eventBus', 'elementRegistry', 'modeling'];

      private eventBus: any;
      private elementRegistry: any;
      private modeling: any;

      constructor(eventBus: any, elementRegistry: any, modeling: any) {
        this.eventBus = eventBus;
        this.elementRegistry = elementRegistry;
        this.modeling = modeling;

        // --- PRE: snapshot old bounds, node Y and connection waypoints
        eventBus.on('commandStack.lane.resize.preExecute', (e: any) => {
          const { context } = e;
          const lane = context.lane || context.shape;
          if (!isLane(lane)) return;

          const participant = findParticipant(lane);
          if (!participant) return;

          context.__oldBounds = { ...lane }; // y + height will be used
          context.__preShapes = {} as Record<string, PreShape>;
          context.__preConns = {} as Record<string, PreConn>;

          // snapshot all flow nodes + connections inside this pool
          (participant.children || []).forEach((el: any) => {
            if (isLane(el) || el.label) return;

            if (isConnection(el)) {
              context.__preConns[el.id] = {
                waypoints: el.waypoints.map((w: any) => ({ x: w.x, y: w.y })),
              };
            } else {
              context.__preShapes[el.id] = { y: el.y };
            }
          });
        });

        // --- POST: translate + relayout connections so they follow the shift
        eventBus.on(
          'commandStack.lane.resize.postExecute',
          -10000,
          (e: any) => {
            const { context } = e;
            const lane = context.lane || context.shape;
            if (!isLane(lane)) return;

            const participant = findParticipant(lane);
            if (!participant) return;

            const old = context.__oldBounds;
            const preShapes: Record<string, PreShape> =
              context.__preShapes || {};
            const preConns: Record<string, PreConn> = context.__preConns || {};

            if (!old) return;

            // which edge moved?
            const oldTop = old.y;
            const newTop = lane.y;
            const topDelta = newTop - oldTop;

            const oldBottom = old.y + old.height;
            const newBottom = lane.y + lane.height;
            const botDelta = newBottom - oldBottom;

            // moved edge + affected region predicate + delta to apply
            let deltaY = 0;
            let isInAffectedRegion: (preY: number) => boolean;

            if (Math.abs(topDelta) > EPS) {
              // top edge moved -> region is everything ABOVE oldTop
              deltaY = topDelta;
              isInAffectedRegion = (preY: number) => preY < oldTop - EPS;
            } else if (Math.abs(botDelta) > EPS) {
              // bottom edge moved -> region is everything AT/BELOW oldBottom
              deltaY = botDelta;
              isInAffectedRegion = (preY: number) => preY >= oldBottom - EPS;
            } else {
              return; // nothing to do
            }

            // build set of nodes that were in the affected region BEFORE the resize
            const movedNodeIds = new Set<string>();
            Object.keys(preShapes).forEach((id) => {
              if (isInAffectedRegion(preShapes[id].y)) movedNodeIds.add(id);
            });

            if (!movedNodeIds.size) return;

            // translate vs. relayout
            const toTranslate: any[] = [];
            const toRelayout: any[] = [];

            // enumerate all connections in the pool
            (participant.children || []).forEach((el: any) => {
              if (!isConnection(el)) return;

              const src = el.source,
                trg = el.target;
              if (!src || !trg) return;

              const srcMoved = movedNodeIds.has(src.id);
              const trgMoved = movedNodeIds.has(trg.id);

              if (srcMoved && trgMoved) {
                // both endpoints were in the region -> translate entire connection by deltaY
                toTranslate.push(el);
              } else if (srcMoved || trgMoved) {
                // one endpoint moved, the other didn't -> recompute routing
                toRelayout.push(el);
              }
            });

            // apply translation using PRE waypoints (clean + precise)
            toTranslate.forEach((conn: any) => {
              const snap = preConns[conn.id];
              if (!snap) return;
              const moved = snap.waypoints.map((wp) => ({
                x: wp.x,
                y: wp.y + deltaY,
              }));
              this.modeling.updateWaypoints(conn, moved);
              if (conn.label)
                this.modeling.moveShape(conn.label, { x: 0, y: deltaY });
            });

            // recompute routing for cross-lane connections
            toRelayout.forEach((conn: any) => {
              this.modeling.layoutConnection(conn, { resetWaypoints: true });
              if (conn.label)
                this.modeling.moveShape(conn.label, { x: 0, y: 0 }); // re-anchor
            });
          }
        );
      }
    },
  ],
};
