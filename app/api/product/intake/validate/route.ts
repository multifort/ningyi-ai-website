import { NextRequest, NextResponse } from "next/server";
import {
  type ApiResponse,
  type IntakeValidationRequest,
  type IntakeValidationResponse,
  validateIntake,
} from "../../../../../lib/product/api-contract";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<IntakeValidationRequest>;
    const result = validateIntake({
      purposePrimary: typeof body.purposePrimary === "string" ? body.purposePrimary : null,
      needDescription: typeof body.needDescription === "string" ? body.needDescription : "",
      hasSelectedContentFile: body.hasSelectedContentFile === true,
    });
    const response: ApiResponse<IntakeValidationResponse> = { success: true, data: result };
    return NextResponse.json(response, { status: result.valid ? 200 : 422 });
  } catch {
    const response: ApiResponse<never> = {
      success: false,
      error: { code: "INVALID_JSON", message: "提交内容无法识别，请检查后重试。", retryable: false },
    };
    return NextResponse.json(response, { status: 400 });
  }
}
