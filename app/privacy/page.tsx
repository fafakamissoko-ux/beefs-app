import Link from 'next/link';
import { AppBackButton } from '@/components/AppBackButton';

export default function PrivacyPage() {
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
            Politique de confidentialité
          </h1>
          <p className="text-gray-500 text-sm mt-3">Plateforme Beefs</p>
          <p className="text-gray-400 text-sm mt-1">Dernière mise à jour : Mars 2026</p>
        </header>

        <div className="space-y-6">
          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">1. Responsable du traitement</h2>
            <p className="text-gray-300 leading-relaxed">
              La présente politique décrit comment Beefs (« nous ») traite les données personnelles des utilisateurs
              (« vous ») du service de débats en direct et des fonctionnalités associées. L&apos;identité précise du
              responsable du traitement (dénomination sociale, coordonnées) peut être complétée dans les mentions
              légales ou les paramètres du service.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">2. Données collectées</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Selon votre utilisation de Beefs, nous pouvons notamment collecter et traiter :
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed">
              <li>
                <strong className="text-white">Adresse e-mail</strong> : inscription, connexion, récupération de
                compte, communications relatives au service.
              </li>
              <li>
                <strong className="text-white">Pseudo (nom d&apos;utilisateur)</strong> et éventuellement nom
                d&apos;affichage : identification sur la plateforme et dans les débats.
              </li>
              <li>
                <strong className="text-white">Photo de profil / avatar</strong> : affichage public sur votre profil
                et dans les contextes prévus par le service.
              </li>
              <li>
                <strong className="text-white">Historique de « beefs »</strong> : participation aux salles en direct,
                statuts, métadonnées associées (dates, titres, rôles participant / spectateur / médiateur selon les
                cas), et données générées dans le cadre des fonctionnalités (commentaires, réactions, points, etc.).
              </li>
              <li>
                Données techniques : identifiants de session, journaux de sécurité, adresse IP approximative, type
                d&apos;appareil et navigateur, dans la mesure nécessaire au fonctionnement et à la sécurité.
              </li>
            </ul>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">3. Finalités et bases légales</h2>
            <p className="text-gray-300 leading-relaxed mb-3">Nous utilisons vos données pour :</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed">
              <li>Fournir le service (comptes, profils, diffusion en direct, historique) — exécution du contrat.</li>
              <li>Assurer la sécurité, prévenir la fraude et la modération — intérêt légitime et obligations légales.</li>
              <li>Communiquer des informations importantes sur le service — exécution du contrat ou intérêt légitime.</li>
              <li>Respecter nos obligations légales (conservation, réponse aux autorités habilitées).</li>
              <li>Améliorer le produit et mesurer l&apos;audience de manière agrégée, dans le respect du droit applicable — intérêt légitime ou consentement le cas échéant.</li>
            </ul>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">4. Stockage et localisation</h2>
            <p className="text-gray-300 leading-relaxed">
              Les données sont hébergées et traitées via <strong className="text-white">Supabase</strong> et
              l&apos;infrastructure associée. Lorsque cela est possible, nous privilégions des régions situées dans
              l&apos;<strong className="text-white">Union européenne</strong> ou des garanties appropriées (clauses
              contractuelles types, mesures complémentaires) lorsque des transferts hors UE sont nécessaires pour
              certains sous-traitants.
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Les durées de conservation varient selon la finalité : compte actif, obligations comptables ou légales,
              litiges en cours, ou besoins de sécurité. Les données inutiles sont supprimées ou anonymisées lorsque
              cela est réalisable.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">5. Cookies et stockage local (localStorage)</h2>
            <p className="text-gray-300 leading-relaxed">
              Beefs peut utiliser des <strong className="text-white">cookies</strong> strictement nécessaires au
              fonctionnement du site (session, sécurité, préférences techniques) et, le cas échéant, des cookies ou
              technologies similaires soumis à votre consentement lorsque la loi l&apos;exige (mesure d&apos;audience,
              marketing).
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              Le <strong className="text-white">localStorage</strong> (ou équivalent) du navigateur peut stocker des
              jetons de session, des préférences d&apos;interface ou des indicateurs techniques pour améliorer
              l&apos;expérience utilisateur. Vous pouvez effacer ces données via les paramètres de votre navigateur ;
              certaines fonctionnalités pourraient alors ne plus fonctionner correctement.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">6. Vos droits (RGPD)</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Si vous êtes situé dans l&apos;Espace économique européen ou lorsque le RGPD s&apos;applique, vous
              disposez notamment des droits suivants, dans les conditions et limites prévues par la loi :
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed">
              <li>
                <strong className="text-white">Accès</strong> : obtenir une copie ou un résumé des données vous
                concernant.
              </li>
              <li>
                <strong className="text-white">Rectification</strong> : corriger des données inexactes ou incomplètes.
              </li>
              <li>
                <strong className="text-white">Effacement (« droit à l&apos;oubli »)</strong> : demander la
                suppression de vos données lorsque les conditions légales sont réunies.
              </li>
              <li>Limitation du traitement, opposition dans certains cas, portabilité des données lorsque applicable.</li>
              <li>Retrait du consentement lorsque le traitement est fondé sur le consentement.</li>
              <li>
                Droit d&apos;introduire une réclamation auprès d&apos;une autorité de protection des données (en
                France, la CNIL :{' '}
                <a
                  href="https://www.cnil.fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gradient font-semibold hover:opacity-90 underline underline-offset-2"
                >
                  cnil.fr
                </a>
                ).
              </li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-3">
              Pour exercer vos droits, utilisez les moyens prévus dans l&apos;application (paramètres du compte) ou
              contactez le DPO / l&apos;équipe privacy à l&apos;adresse indiquée ci-dessous. Une pièce
              d&apos;identité peut être demandée pour éviter la fraude.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">7. Partage avec des tiers</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Nous ne vendons pas vos données personnelles. Nous pouvons partager certaines informations avec des
              prestataires strictement nécessaires au service :
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-300 leading-relaxed">
              <li>
                <strong className="text-white">Stripe</strong> : traitement des paiements et opérations financières
                associées (par exemple achats de points ou retraits). Stripe traite les données de paiement selon sa
                propre politique de confidentialité et les normes PCI-DSS.
              </li>
              <li>
                <strong className="text-white">Daily.co</strong> (ou équivalent) : infrastructure de visioconférence
                et streaming vidéo pour les débats en direct. Des métadonnées techniques et, le cas échéant, des
                flux peuvent transiter par ce prestataire conformément à sa documentation et aux paramètres du service.
              </li>
              <li>Hébergeur et base de données (dont Supabase), outils d&apos;e-mail transactionnel, monitoring et sécurité.</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-3">
              Ces sous-traitants ne peuvent utiliser vos données que sur nos instructions et dans le cadre contractuel
              prévu par le RGPD lorsque applicable.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">8. Sécurité des données</h2>
            <p className="text-gray-300 leading-relaxed">
              Nous mettons en œuvre des mesures techniques et organisationnelles appropriées : chiffrement en transit
              (HTTPS), contrôle d&apos;accès, journalisation, mises à jour de sécurité, et formation des personnes
              habilitées. Aucun système n&apos;est toutefois exempt de risque ; en cas d&apos;incident affectant vos
              données personnelles, nous prendrons les mesures prévues par la loi (notification à l&apos;autorité et,
              si nécessaire, aux personnes concernées).
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">9. Contact — Délégué à la protection des données (DPO)</h2>
            <p className="text-gray-300 leading-relaxed">
              Pour toute question relative à cette politique, à l&apos;exercice de vos droits ou au traitement de vos
              données personnelles, vous pouvez contacter le délégué à la protection des données (DPO) ou l&apos;équipe
              privacy à l&apos;adresse publiée dans les <strong className="text-white">mentions légales</strong> de
              Beefs, ou via le canal de support / formulaire de contact mis à disposition dans l&apos;application.
            </p>
          </section>

          <section className="card rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-3">10. Évolution de la politique</h2>
            <p className="text-gray-300 leading-relaxed">
              Nous pouvons modifier cette politique pour refléter des changements juridiques ou fonctionnels. La date
              de « Dernière mise à jour » en tête de page sera actualisée. Nous vous informerons des changements
              importants par un moyen visible (notification, e-mail) lorsque la loi l&apos;exige.
            </p>
          </section>

          <p className="text-gray-500 text-sm text-center pt-4">
            Voir aussi les{' '}
            <Link href="/cgu" className="text-gradient font-semibold hover:opacity-90">
              Conditions Générales d&apos;Utilisation
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
