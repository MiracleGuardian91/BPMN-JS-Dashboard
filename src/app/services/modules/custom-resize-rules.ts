import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { is } from 'bpmn-js/lib/util/ModelUtil';

const HIGH_PRIORITY = 2000;

class CustomResizeRules extends RuleProvider {
  static override $inject = ['eventBus'];

  constructor(eventBus: any) {
    super(eventBus);
  }

  override init(): void {
    this.addRule('shape.resize', HIGH_PRIORITY, (context: any) => {
      const { shape, newBounds } = context;

      // Disallow resizing of labels
      if (shape && shape.type === 'label') return false;

      // Allow resizing for all BPMN elements including events, gateways, tasks, subprocesses, data objects, etc.
      // Enforce minimal reasonable sizes to prevent accidental collapse
      const min = this.getMinimumSize(shape);
      if (
        newBounds &&
        (newBounds.width < min.width || newBounds.height < min.height)
      ) {
        return false;
      }

      return true;
    });
  }

  private getMinimumSize(shape: any): { width: number; height: number } {
    // Provide sensible defaults per common BPMN shape categories
    if (
      is(shape, 'bpmn:Task') ||
      is(shape, 'bpmn:SubProcess') ||
      is(shape, 'bpmn:CallActivity')
    ) {
      return { width: 80, height: 50 };
    }

    if (is(shape, 'bpmn:Participant')) {
      // Lanes/Participants can be quite big; keep a higher minimum height
      return { width: 200, height: 60 };
    }

    if (is(shape, 'bpmn:TextAnnotation')) {
      return { width: 50, height: 30 };
    }

    if (
      is(shape, 'bpmn:StartEvent') ||
      is(shape, 'bpmn:EndEvent') ||
      is(shape, 'bpmn:IntermediateThrowEvent') ||
      is(shape, 'bpmn:IntermediateCatchEvent') ||
      is(shape, 'bpmn:BoundaryEvent') ||
      is(shape, 'bpmn:Gateway')
    ) {
      // Allow resizing but keep a small minimum; renderer will keep visuals consistent
      return { width: 28, height: 28 };
    }

    // Generic fallback
    return { width: 30, height: 30 };
  }
}

export default {
  __init__: ['customResizeRules'],
  customResizeRules: ['type', CustomResizeRules],
};
