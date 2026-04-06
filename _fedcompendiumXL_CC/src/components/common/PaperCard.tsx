import React from 'react';
import {
  Box,
  Flex,
  Text,
  Heading,
  Badge,
  Tag,
  useColorModeValue,
  Icon,
  Button,
  Divider,
  As
} from '@chakra-ui/react';
import { FiFileText, FiUsers, FiCalendar } from 'react-icons/fi';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

// Tipi per categorie e difficoltà
type Category = 'basics' | 'algorithms' | 'applications' | 'privacy' | 'systems';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface PaperCardProps {
  title: string;
  authors: string;
  conference: string;
  year?: string;
  tags?: string[];
  categories?: Category[];
  difficulty?: Difficulty;
  // Proprietà imageUrl opzionale per compatibilità con il codice esistente
  imageUrl?: string;
  onClick?: () => void;
}

// Funzione per ottenere il colore della categoria
const getCategoryColor = (category: string) => {
  switch(category) {
    case 'basics':
      return 'blue';
    case 'algorithms':
      return 'purple';
    case 'privacy':
      return 'red';
    case 'applications':
      return 'orange';
    case 'systems':
      return 'cyan';
    default:
      return 'gray';
  }
};

// Funzione per ottenere il colore della difficoltà
const getDifficultyColor = (difficulty: string) => {
  switch(difficulty) {
    case 'beginner':
      return 'green';
    case 'intermediate':
      return 'orange';
    case 'advanced':
      return 'red';
    default:
      return 'gray';
  }
};

export const PaperCard: React.FC<PaperCardProps> = ({
  title,
  authors,
  conference,
  year = '2024',
  tags = ['federated learning'],
  categories = [],
  difficulty,
  imageUrl, // Aggiunto per compatibilità ma non viene utilizzato
  onClick,
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBorderColor = useColorModeValue('blue.300', 'blue.600');
  const textColor = useColorModeValue('gray.800', 'white');
  const accentBg = useColorModeValue('blue.50', 'blue.900');
  const iconColor = useColorModeValue('blue.500', 'blue.300');

  return (
    <MotionBox
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Box
        borderRadius="lg"
        bg={bgColor}
        border="1px"
        borderColor={borderColor}
        boxShadow="sm"
        overflow="hidden"
        transition="all 0.2s"
        _hover={{
          borderColor: hoverBorderColor,
          boxShadow: 'md',
        }}
      >
        <Box p={4}>
          <Flex mb={3}>
            <Box
              p={2}
              bg={accentBg}
              borderRadius="md"
              color={iconColor}
              mr={3}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon as={FiFileText as As} boxSize={5} />
            </Box>
            
            <Box>
              <Heading size="md" mb={1} color={textColor} lineHeight="1.4" noOfLines={2}>
                {title}
              </Heading>
              
              <Flex gap={2} mb={2} wrap="wrap">
                <Badge colorScheme="purple">Research Paper</Badge>
                <Badge colorScheme="blue">{year}</Badge>
                
                {/* Mostra difficoltà se presente */}
                {difficulty && (
                  <Badge colorScheme={getDifficultyColor(difficulty)}>
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                  </Badge>
                )}
              </Flex>
            </Box>
          </Flex>
          
          <Flex mb={3} alignItems="center">
            <Icon as={FiUsers as As} mr={2} color="gray.500" />
            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
              {authors}
            </Text>
          </Flex>
          
          <Flex mb={4} alignItems="center">
            <Icon as={FiCalendar as As} mr={2} color="gray.500" />
            <Text fontSize="sm" fontWeight="medium" color="blue.600" _dark={{ color: "blue.300" }}>
              {conference}
            </Text>
          </Flex>
          
          {/* Categorie */}
          {categories.length > 0 && (
            <Flex mb={3} gap={2} wrap="wrap">
              {categories.map((category) => (
                <Badge 
                  key={category} 
                  colorScheme={getCategoryColor(category)}
                  variant="solid"
                  px={2}
                  py={0.5}
                  borderRadius="md"
                  fontSize="xs"
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </Badge>
              ))}
            </Flex>
          )}
          
          {/* Tags */}
          <Flex wrap="wrap" gap={2} mb={2}>
            {tags.map((tag) => (
              <Tag key={tag} size="sm" variant="subtle">
                {tag}
              </Tag>
            ))}
          </Flex>
        </Box>
        
        <Divider />
        
        <Box p={3}>
          <Button
            size="sm"
            variant="ghost"
            colorScheme="blue"
            rightIcon={<ChevronRightIcon />}
            onClick={onClick}
          >
            View Paper
          </Button>
        </Box>
      </Box>
    </MotionBox>
  );
};

export default PaperCard;