"""Testes mínimos do agrupamento (pedido do Moisés, 4/nov/2026). python3 -m unittest tools/mercado/test_agrupar.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agrupar import agrupar, blocos_area, CFG  # noqa: E402


def un(area, andar=1, m2=10000, dorm=2, vagas=0, torre='', prog='nao', sit='d', p1=True):
    return {'torre': torre, 'andar': andar, 'dorm': dorm, 'vagas': vagas, 'area': area, 'p1': round(area * m2) if p1 and area else None,
            'sit': sit, 'preco': round(area * m2) if area else None, 'vendida': False, 'prog': prog}


def tamanhos(gs):
    return sorted(len(g['us']) for g in gs)


class Agrupar(unittest.TestCase):
    def test_areas_40_41_42_juntas(self):
        us = [un(40, a) for a in range(1, 4)] + [un(41, a) for a in range(1, 4)] + [un(42, a) for a in range(1, 4)]
        self.assertEqual(len(blocos_area(us, CFG['area_mediana_pct'])), 1)

    def test_areas_40_e_44_separadas(self):
        us = [un(40, a) for a in range(1, 4)] + [un(44, a) for a in range(1, 4)]
        self.assertEqual(len(blocos_area(us, CFG['area_mediana_pct'])), 2)

    def test_rampa_1pct_20_andares_um_grupo(self):
        us = [un(40, a, 10000 * 1.01 ** a) for a in range(1, 21)]
        self.assertEqual(len(agrupar(us)), 1)

    def test_salto_5pct_separa(self):
        us = [un(40, a, 10000) for a in range(1, 6)] + [un(40, a, 10500) for a in range(6, 11)]
        self.assertEqual(tamanhos(agrupar(us)), [5, 5])

    def test_mesmo_andar_15_junto_25_separa(self):
        junto = [un(40, a, 10000) for a in range(1, 4)] + [un(40, a, 10150) for a in range(1, 4)]
        self.assertEqual(len(agrupar(junto)), 1)
        sep = [un(40, a, 10000) for a in range(1, 4)] + [un(40, a, 10250) for a in range(1, 4)]
        self.assertEqual(tamanhos(agrupar(sep)), [3, 3])

    def test_programa_social_separa(self):
        us = [un(40, a, prog='sim') for a in range(1, 4)] + [un(40, a, prog='nao') for a in range(1, 4)]
        self.assertEqual(tamanhos(agrupar(us)), [3, 3])

    def test_grupo_de_2_que_difere_no_preco_fica_separado_e_pequeno(self):
        us = [un(40, a, 10000) for a in range(1, 6)] + [un(40, a, 11000) for a in range(6, 8)]
        gs = agrupar(us)
        self.assertEqual(tamanhos(gs), [2, 5])
        self.assertEqual([g['pequeno'] for g in gs if len(g['us']) == 2], [True])

    def test_grupo_de_2_que_difere_so_na_area_junta_e_fica_pequeno(self):
        us = [un(40, a, 10000) for a in range(1, 6)] + [un(44, a, 10100) for a in range(6, 8)]
        gs = agrupar(us)
        self.assertEqual(tamanhos(gs), [7])
        self.assertTrue(gs[0]['pequeno'])

    def test_grupo_de_2_com_outra_area_e_outro_preco_fica_separado(self):
        us = [un(40, a, 10000) for a in range(1, 6)] + [un(44, a, 10500) for a in range(6, 8)]
        self.assertEqual(tamanhos(agrupar(us)), [2, 5])

    def test_grupo_pequeno_nao_junta_com_outra_semelhanca(self):
        us = [un(40, a, 10000) for a in range(1, 6)] + [un(44, a, 10000, dorm=3) for a in range(6, 8)]
        self.assertEqual(tamanhos(agrupar(us)), [2, 5])

    def test_com_e_sem_vaga_nao_misturam(self):
        us = [un(40, a, vagas=0) for a in range(1, 4)] + [un(40, a, vagas=1) for a in range(1, 4)]
        self.assertEqual(tamanhos(agrupar(us)), [3, 3])

    def test_sem_preco_vai_para_o_mesmo_andar(self):
        us = [un(40, a, 10000) for a in range(1, 4)] + [un(40, a, 10500) for a in range(4, 7)] + [un(40, 5, p1=False)]
        gs = agrupar(us)
        g5 = [g for g in gs if any(not u['p1'] for u in g['us'])][0]
        self.assertTrue(all(u['andar'] >= 4 for u in g5['us']))

    def test_area_nula_fica_fora(self):
        us = [un(40, a) for a in range(1, 4)] + [un(None, 4)]
        self.assertEqual(sum(len(g['us']) for g in agrupar(us)), 3)


if __name__ == '__main__':
    unittest.main()
