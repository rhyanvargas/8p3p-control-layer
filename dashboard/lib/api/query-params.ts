/** Omit empty org_id so the proxy can inject CONTROL_LAYER_ORG_ID when pinned. */
export function appendOrgId(params: URLSearchParams, orgId: string): void {
  if (orgId) {
    params.set('org_id', orgId);
  }
}
