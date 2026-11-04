import type {ParameterFormat} from './template-parameters';
export type TemplateButton = {type:"URL"|"PHONE_NUMBER"|"QUICK_REPLY"|"COPY_CODE"|"FLOW";text:string;url?:string;phone_number?:string;example?:string;flow_id?:string};
export type ImageHeader = {format:"IMAGE"|"VIDEO"|"DOCUMENT";handle:string}|{format:"LOCATION"}|{format:"TEXT";text:string;samples?:string[]};
export type TemplateDraft={name:string;language:string;category:string;text:string;samples:string[];header?:ImageHeader;buttons?:TemplateButton[];footer?:string;parameterFormat?:ParameterFormat};
export type TemplatePreview={payload:Record<string,unknown>;renderedText:string;submitted:boolean;notice:string};
