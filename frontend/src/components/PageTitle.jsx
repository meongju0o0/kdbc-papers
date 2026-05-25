export default function PageTitle({ title, subtitle }) {
  return (
    <section className="page-title-box">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </section>
  );
}
