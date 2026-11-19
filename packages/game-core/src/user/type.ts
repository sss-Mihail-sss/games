export interface User {
  id: string;
  name: string;
  kind: "guest" | "account";
}
