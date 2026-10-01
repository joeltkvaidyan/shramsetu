/** Field-level validation message (role=alert), shared by register steps. */
export default function FieldErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-red-600 text-xs mt-1">
      {message}
    </p>
  );
}
