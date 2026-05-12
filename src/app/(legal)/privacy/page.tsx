import Link from "next/link";

export const metadata = {
  title: "Política de privacidade | ERP HD",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-slate max-w-none prose-headings:font-semibold">
      <h1>Política de privacidade</h1>
      <p className="text-sm text-slate-600">
        Última actualização: referência interna versão <strong>1.0</strong>.
      </p>

      <h2>1. Responsável pelo tratamento</h2>
      <p>
        Os dados pessoais tratados através desta aplicação são da responsabilidade da
        entidade que a utiliza (o seu empregador ou contratante), na qualidade de
        controlador, nos termos da Lei Geral de Protecção de Dados (Lei n.º 13.709/2018 —
        LGPD).
      </p>

      <h2>2. Dados colectados</h2>
      <p>
        Podem ser tratados, entre outros: identificação e contacto (nome, e-mail),
        dados de autenticação, registos de actividade na aplicação, dados operacionais
        introduzidos no ERP (encomendas, produtos, fornecedores, etc.), endereço IP e
        informação técnica do browser quando relevante para segurança e auditoria.
      </p>

      <h2>3. Finalidades</h2>
      <p>
        Os dados são utilizados para prestação do serviço de gestão empresarial,
        cumprimento de obrigações legais ou contratuais, segurança da informação,
        suporte técnico e melhoria contínua da plataforma, sempre em conformidade com a
        base legal aplicável (execução de contrato, legítimo interesse, cumprimento de
        obrigação legal ou consentimento, quando exigido).
      </p>

      <h2>4. Direitos dos titulares</h2>
      <p>
        Nos termos da LGPD, o titular pode solicitar confirmação de tratamento, acesso,
        correcção, anonimização, portabilidade, eliminação dos dados desnecessários ou
        excessivos, informação sobre partilhas e revogação do consentimento, quando
        aplicável. Os pedidos devem ser canalizados junto do responsável pelo tratamento
        na sua organização.
      </p>

      <h2>5. Conservação</h2>
      <p>
        Os dados são conservados pelo tempo necessário às finalidades descritas e às
        obrigações legais, podendo ser eliminados ou anonimizados quando deixarem de ser
        necessários.
      </p>

      <h2>6. Segurança</h2>
      <p>
        São aplicadas medidas técnicas e organizativas adequadas para proteger os dados
        contra acessos não autorizados, perda ou alteração indevida.
      </p>

      <p className="not-prose pt-6">
        <Link href="/login" className="text-brand-700 text-sm font-medium hover:underline">
          Ir para o login
        </Link>
      </p>
    </article>
  );
}
