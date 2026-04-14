import Link from 'next/link';
import { AppBackButton } from '@/components/AppBackButton';

export default function CGUPage() {
  return (
    <div className="min-h-screen text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-[120px]"
          style={{ background: 'rgba(232, 58, 20, 0.06)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-[120px]"
          style={{ background: 'rgba(0, 229, 255, 0.04)' }}
        />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-8 pb-20">
        <div className="mb-8">
          <AppBackButton fallback="/feed" label="Retour au fil" />
        </div>

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-gradient tracking-tight">
            Conditions Générales d&apos;Utilisation
          </h1>
          <p className="text-gray-500 text-sm mt-3">Plateforme Beefs</p>
          <p className="text-gray-400 text-sm mt-1">Dernière mise à jour : Mars 2026</p>
        </header>

        <div className="space-y-6">
          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">1. Objet du service</h2>
            <p className="text-gray-300 leading-relaxed">
              Beefs est une plateforme en ligne permettant d&apos;organiser et de suivre des débats, confrontations
              ou « beefs » en direct entre utilisateurs, avec médiation et participation du public. Le service
              inclut notamment la diffusion en direct, l&apos;interaction entre participants et spectateurs, ainsi
              que des fonctionnalités associées (profils, historique, monnaie virtuelle, etc.).
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Les présentes Conditions Générales d&apos;Utilisation (CGU) régissent l&apos;accès et l&apos;usage de
              Beefs. En créant un compte ou en utilisant le service, vous les acceptez sans réserve.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">2. Conditions d&apos;inscription</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed">
              <li>
                Vous devez avoir au moins <strong className="text-white">13 ans</strong> au moment de
                l&apos;inscription. Si vous avez entre 13 et l&apos;âge de la majorité dans votre pays, l&apos;accord
                d&apos;un titulaire de l&apos;autorité parentale peut être exigé par la loi applicable.
              </li>
              <li>
                Vous devez fournir une <strong className="text-white">adresse e-mail valide</strong> et des
                informations exactes. Un pseudo peut être requis ; il ne doit pas usurper l&apos;identité d&apos;un
                tiers ni porter atteinte aux droits de tiers.
              </li>
              <li>
                Vous êtes responsable de la confidentialité de vos identifiants et de toute activité réalisée depuis
                votre compte.
              </li>
            </ul>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">3. Règles de conduite</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Beefs est un espace de débat public. Le ton peut être vif, mais reste soumis aux limites légales et à
              ces règles. Sont notamment interdits :
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed">
              <li>Les propos ou contenus incitant à la <strong className="text-white">haine</strong>, à la violence, au harcèlement ou à la discrimination (notamment fondée sur la race, la religion, le sexe, l&apos;orientation sexuelle, le handicap ou toute autre caractéristique protégée).</li>
              <li>Le <strong className="text-white">harcèlement</strong> (y compris cyberharcèlement), le doxxing, les menaces et l&apos;intimidation.</li>
              <li>La glorification ou l&apos;incitation à des actes de <strong className="text-white">violence</strong> réelle contre des personnes ou des groupes.</li>
              <li>La diffusion de contenus illégaux, pornographiques impliquant des mineurs, ou de nature terroriste.</li>
              <li>Toute tentative de nuire au service, d&apos;usurper une identité ou de contourner la modération de manière abusive.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-3">
              Beefs peut retirer tout contenu, suspendre ou résilier un compte en cas de manquement, sans préjudice
              des poursuites éventuelles.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">4. Monnaie virtuelle (points) et retraits</h2>
            <p className="text-gray-300 leading-relaxed">
              Le service peut proposer une <strong className="text-white">monnaie virtuelle</strong> (« points » ou
              équivalent) utilisée sur la plateforme. Les points n&apos;ont pas de valeur monétaire en dehors des
              mécanismes explicitement prévus par Beefs (par exemple retraits soumis à conditions).
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed mt-3">
              <li>Les modalités d&apos;acquisition, d&apos;échange et d&apos;expiration des points sont précisées dans l&apos;interface et peuvent évoluer.</li>
              <li>Les <strong className="text-white">demandes de retrait</strong> (le cas échéant) sont soumises à vérification, délais, seuils minimums, frais éventuels et conformité réglementaire (dont lutte contre la fraude et le blanchiment).</li>
              <li>Beefs se réserve le droit de refuser ou d&apos;annuler des opérations en cas de violation des CGU, de suspicion d&apos;abus ou d&apos;exigence légale.</li>
            </ul>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">5. Rôle et responsabilité du médiateur</h2>
            <p className="text-gray-300 leading-relaxed">
              Lorsqu&apos;un <strong className="text-white">médiateur</strong> (ou animateur) intervient dans un débat
              en direct, il contribue à l&apos;organisation du flux et peut exercer une modération raisonnable dans
              le cadre défini par Beefs. Le médiateur n&apos;est pas un arbitre juridique : ses décisions
              d&apos;ordre pratique (coupure micro, exclusion temporaire de l&apos;échange, etc.) ne préjugent pas
              d&apos;un litige devant les tribunaux.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Les médiateurs et Beefs ne sauraient être tenus responsables des opinions exprimées par les
              participants, sous réserve des obligations légales applicables (signalement de contenus illicites,
              coopération avec les autorités, etc.).
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">6. Propriété intellectuelle</h2>
            <p className="text-gray-300 leading-relaxed">
              La marque, l&apos;interface, les textes, graphismes, logos et logiciels de Beefs sont protégés par le
              droit de la propriété intellectuelle. Toute reproduction ou exploitation non autorisée est interdite.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              En publiant du contenu sur Beefs (messages, avatar, extraits audiovisuels le cas échéant), vous accordez
              à Beefs une licence non exclusive, mondiale et gratuite, pour héberger, afficher, diffuser et adapter ce
              contenu dans le cadre strict du fonctionnement et de la promotion du service, tant que votre compte
              existe ou que le contenu reste en ligne, dans la mesure permise par la loi.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">7. Résiliation du compte</h2>
            <p className="text-gray-300 leading-relaxed">
              Vous pouvez demander la suppression de votre compte ou cesser d&apos;utiliser Beefs à tout moment, selon
              les options disponibles dans les paramètres ou en contactant le support.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Beefs peut suspendre ou clôturer un compte en cas de manquement aux CGU, de risque pour la sécurité du
              service ou sur demande des autorités compétentes. Certaines données peuvent être conservées le temps
              nécessaire aux obligations légales (voir la Politique de confidentialité).
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">8. Limitation de responsabilité</h2>
            <p className="text-gray-300 leading-relaxed">
              Beefs est fourni « en l&apos;état ». Dans les limites autorisées par la loi, Beefs décline toute
              responsabilité pour les interruptions de service, pertes de données, dommages indirects ou perte de
              profits liés à l&apos;usage de la plateforme.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Vous utilisez les débats en direct et les interactions à vos propres risques. Beefs ne garantit pas
              l&apos;exactitude des propos des utilisateurs ni l&apos;absence de comportements répréhensibles malgré
              la modération.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Rien dans les présentes CGU ne limite une responsabilité qui ne pourrait légalement être exclue (par
              exemple en cas de dol ou de faute lourde, selon le droit applicable).
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">9. Modification des CGU</h2>
            <p className="text-gray-300 leading-relaxed">
              Beefs peut modifier les présentes CGU pour refléter l&apos;évolution du service ou des obligations
              légales. La date de « dernière mise à jour » en tête de page sera actualisée. Lorsque la loi
              l&apos;exige, vous serez informé par un moyen approprié (notification, bannière, e-mail) et, le cas
              échéant, votre accord sera sollicité.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              La poursuite de l&apos;utilisation du service après entrée en vigueur des modifications vaut acceptation,
              sauf disposition contraire obligatoire.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">10. Droit applicable et litiges</h2>
            <p className="text-gray-300 leading-relaxed">
              Sauf règle impérative contraire, les présentes CGU sont régies par le droit applicable désigné par
              l&apos;éditeur de Beefs. Les tribunaux compétents sont ceux prévus par la loi ou, à défaut, ceux du
              siège de l&apos;éditeur. Pour les consommateurs de l&apos;Union européenne, des droits non dérogeables
              peuvent s&apos;appliquer (notamment en matière de juridiction).
            </p>
          </section>

          <p className="text-gray-500 text-sm text-center pt-4">
            Pour toute question relative aux données personnelles, consultez la{' '}
            <Link href="/privacy" className="text-gradient font-semibold hover:opacity-90">
              Politique de confidentialité
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
