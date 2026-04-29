'use client';

import { motion } from 'framer-motion';
import { Shield, Sword, Gavel, Heart, Flame, Zap } from 'lucide-react';

export default function RulesPage() {
  const rules = [
    {
      icon: Heart,
      title: 'Respect Absolu',
      desc: "L'Agora est un lieu de confrontation d'idées, pas de haine. Les insultes personnelles et discriminations entraînent une expulsion immédiate.",
    },
    {
      icon: Sword,
      title: 'Loyauté du Duel',
      desc: 'Un Beef se règle face à face. Pas de faux comptes, pas de raids coordonnés. Que le meilleur argument gagne.',
    },
    {
      icon: Zap,
      title: "L'Aura se mérite",
      desc: "L'Aura est le reflet de ton impact. Elle ne s'achète pas, elle se gagne par la pertinence de tes interventions et le soutien du public.",
    },
    {
      icon: Gavel,
      title: "L'Autorité du Ref",
      desc: "Il est le maître de l'Agora. S'il coupe ton micro, le silence est absolu. Ses décisions sont irrévocables.",
    },
  ];

  return (
    <div className="min-h-[100dvh] w-full bg-[#050505] px-6 py-12 md:py-20 pb-32">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-16 text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-plasma-600 to-violet-700 shadow-glow-plasma">
            <Shield className="h-10 w-10 text-white" />
          </div>
          <h1 className="mb-4 font-sans text-4xl font-black uppercase italic tracking-tighter text-white md:text-6xl">
            Les Lois de l&apos;Agora
          </h1>
          <p className="mx-auto max-w-xl font-medium text-gray-400">
            Beefs est une terre de liberté, mais toute terre a ses lois. Voici les piliers de l&apos;Agora sur lesquels repose notre communauté.
          </p>
        </motion.div>

        {/* Grille des règles */}
        <div className="grid gap-6 md:grid-cols-2">
          {rules.map((rule, i) => {
            const Icon = rule.icon;
            return (
              <motion.div
                key={rule.title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur-xl transition-all hover:border-plasma-500/50 hover:bg-white/10"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-plasma-500/20 text-plasma-400 transition-colors group-hover:bg-plasma-500 group-hover:text-white">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mb-2 font-sans text-xl font-black uppercase tracking-tight text-white">{rule.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400 group-hover:text-gray-300">{rule.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Footer / Call to Action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 rounded-[2.5rem] border border-plasma-500/10 bg-gradient-to-br from-plasma-900/20 to-transparent p-6 md:p-8 text-center"
        >
          <Flame className="mx-auto mb-4 h-8 w-8 text-plasma-500" aria-hidden />
          <p className="mb-8 font-mono text-xs font-bold uppercase tracking-widest text-plasma-400">
            Prêt à entrer dans l&apos;histoire ?
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/signup';
            }}
            className="rounded-2xl bg-white px-10 py-4 text-xs font-black uppercase tracking-widest text-black transition-transform hover:scale-105 active:scale-95"
          >
            Accepter le code et s&apos;inscrire
          </button>
        </motion.div>
      </div>
    </div>
  );
}
